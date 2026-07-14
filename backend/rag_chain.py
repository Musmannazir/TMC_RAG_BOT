"""
The actual RAG brain.

Pipeline:
  1. History-aware retriever: rewrites the latest question into a
     standalone query using chat history, so "what about the second one?"
     retrieves correctly instead of retrieving nothing useful.
  2. Stuff-documents chain: feeds retrieved chunks + question into a strict
     grounding prompt (answer ONLY from context, cite sources, say "I don't
     know" when the answer isn't present).
  3. RunnableWithMessageHistory: wraps the whole thing so each session_id
     gets its own persisted (SQLite) conversation thread.
"""
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

import time
import config
from session_store import get_session_history

_vectorstore = None
_conversational_chain = None


SYSTEM_PROMPT = """You are the TMC (TallyMarks Consulting) HR Policy Assistant.
Answer the employee's question using ONLY the context below, which is retrieved
directly from official TMC policy documents.

Rules — follow them exactly:
1. Answer strictly from the provided context chunks. Never use outside knowledge, 
   assumptions, or extrapolate from incomplete data points.
2. If the context does not explicitly contain the exact fact needed to answer 
   the question, say clearly: "I don't have that information in the TMC policy documents I have access to."
3. Do not attempt to complete a sentence or guess a value (like percentages, dates, or numbers) 
   if it is cut off or missing in the context chunks.
4. After every factual claim, cite the source in the format (Source: <file>,
   page <page>) using the metadata given with each context chunk.
5. Be concise, professional, and clear — write like an HR assistant, not a
   search engine. Use short paragraphs or bullet points where helpful.
6. If the question is ambiguous, ask a brief clarifying question instead of
   guessing which policy it refers to.

Context:
{context}
"""

CONDENSE_PROMPT = """Given the chat history and the latest user question, rewrite
the latest question as a standalone question that makes sense without the chat
history. Do NOT answer it — only reformulate it if needed, otherwise return it
as-is."""


def _load_vectorstore():
    global _vectorstore
    if _vectorstore is None:
        embeddings = HuggingFaceEmbeddings(model_name=config.EMBEDDING_MODEL)
        _vectorstore = FAISS.load_local(
            str(config.VECTORSTORE_DIR),
            embeddings,
            allow_dangerous_deserialization=True,  # safe: it's our own locally-built index
        )
    return _vectorstore


def _build_chain():
    global _conversational_chain
    if _conversational_chain is not None:
        return _conversational_chain

    if not config.GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add it to backend/.env before asking questions."
        )

    vectorstore = _load_vectorstore()
    retriever = vectorstore.as_retriever(search_kwargs={"k": config.TOP_K})

    llm = ChatGroq(model=config.GROQ_MODEL, api_key=config.GROQ_API_KEY, temperature=0)

    condense_question_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", CONDENSE_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )
    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, condense_question_prompt
    )

    qa_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )
    document_chain = create_stuff_documents_chain(llm, qa_prompt)

    retrieval_chain = create_retrieval_chain(history_aware_retriever, document_chain)

    _conversational_chain = RunnableWithMessageHistory(
        retrieval_chain,
        get_session_history,
        input_messages_key="input",
        history_messages_key="chat_history",
        output_messages_key="answer",
    )
    return _conversational_chain


def _format_citations(context_docs):
    seen = set()
    citations = []
    for doc in context_docs:
        source = doc.metadata.get("source", "unknown")
        page = doc.metadata.get("page", "?")
        key = (source, page)
        if key in seen:
            continue
        seen.add(key)
        snippet = doc.page_content.strip().replace("\n", " ")
        if len(snippet) > 220:
            snippet = snippet[:220].rsplit(" ", 1)[0] + "..."
        citations.append({"source": source, "page": page, "snippet": snippet})
    return citations


def ask(question: str, session_id: str, full_context: bool = False) -> dict:
    """Returns {"answer": str, "citations": [...], "full_context": str (optional)}"""
    chain = _build_chain()
    result = _invoke_with_retry(chain, question, session_id)
    answer = result.get("answer", "").strip()
    context_docs = result.get("context", [])
    citations = _format_citations(context_docs)

    if not context_docs:
        answer = answer or (
            "I don't have that information in the TMC policy documents I have access to."
        )

    output = {"answer": answer, "citations": citations}
    if full_context:
        output["full_context"] = "\n---\n".join(
            doc.page_content.strip() for doc in context_docs
        )
    return output

@retry(
    wait=wait_exponential(multiplier=1, min=2, max=20),
    stop=stop_after_attempt(4),
    retry=retry_if_exception_type(Exception),
    reraise=True,
)
def _invoke_with_retry(chain, question, session_id):
    # Groq free-tier rate limits (429s) are transient — back off and retry
    # a few times before giving up, instead of failing the user's request.
    return chain.invoke(
        {"input": question},
        config={"configurable": {"session_id": session_id}},
    )

def ask_stream(question: str, session_id: str):
    """
    Generator that yields dicts as the answer streams in:
      {"type": "token", "content": "..."}   -- one or more times
      {"type": "citations", "citations": [...]}  -- once, at the end
    Retries only apply if the FIRST chunk fails (e.g. a transient Groq 429);
    once tokens have started streaming to the user, we don't retry mid-stream.
    """
    chain = _build_chain()
    context_docs = []
    started = False

    attempts = 0
    max_attempts = 4
    backoff = 2

    while True:
        try:
            for chunk in chain.stream(
                {"input": question},
                config={"configurable": {"session_id": session_id}},
            ):
                started = True
                if "context" in chunk:
                    context_docs = chunk["context"]
                if "answer" in chunk and chunk["answer"]:
                    yield {"type": "token", "content": chunk["answer"]}
            break  # streamed fully without error
        except Exception:
            attempts += 1
            if started or attempts >= max_attempts:
                raise
            time.sleep(backoff)
            backoff *= 2

    citations = _format_citations(context_docs)
    yield {"type": "citations", "citations": citations}