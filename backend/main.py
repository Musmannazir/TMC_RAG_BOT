"""
FastAPI backend for the TMC Policy RAG chatbot.

Run:
    uvicorn main:app --reload --port 8000

Endpoints:
    GET  /health                    -> liveness check
    POST /ask                       -> {question, session_id} -> {answer, citations}  (non-streaming)
    POST /ask/stream                -> {question, session_id} -> Server-Sent Events stream
    GET  /history/{session_id}      -> full message history for a session
    DELETE /history/{session_id}    -> clear a session's history
"""
import json
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config
import session_store
from rag_chain import ask as rag_ask, ask_stream as rag_ask_stream

app = FastAPI(title="TMC Policy RAG API", version="1.0.0")

# Origins allowed to call this API. Streamlit's default port (8501) and
# Vite's default dev port (5173) are both included so either frontend
# works out of the box; config.FRONTEND_ORIGIN covers a deployed frontend.
ALLOWED_ORIGINS = {
    config.FRONTEND_ORIGIN,
    "http://localhost:8501",
    "http://127.0.0.1:8501",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in ALLOWED_ORIGINS if origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str
    session_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    citations: list[dict]
    session_id: str


@app.get("/health")
def health():
    vectorstore_ready = (config.VECTORSTORE_DIR / "index.faiss").exists()
    return {
        "status": "ok",
        "vectorstore_ready": vectorstore_ready,
        "groq_key_set": bool(config.GROQ_API_KEY),
    }


def _validate_request(payload: AskRequest):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question cannot be empty")
    if not (config.VECTORSTORE_DIR / "index.faiss").exists():
        raise HTTPException(
            status_code=503,
            detail="Vector store not found. Run `python ingest.py` first to index the TMC_Data PDFs.",
        )
    return question, (payload.session_id or str(uuid4()))


@app.post("/ask", response_model=AskResponse)
def ask(payload: AskRequest):
    question, session_id = _validate_request(payload)
    try:
        result = rag_ask(question, session_id)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

    return AskResponse(answer=result["answer"], citations=result["citations"], session_id=session_id)


@app.post("/ask/stream")
def ask_stream(payload: AskRequest):
    question, session_id = _validate_request(payload)

    def event_generator():
        yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        try:
            for event in rag_ask_stream(question, session_id):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/history/{session_id}")
def get_history(session_id: str):
    return {"session_id": session_id, "messages": session_store.list_messages(session_id)}


@app.delete("/history/{session_id}")
def delete_history(session_id: str):
    session_store.clear_session(session_id)
    return {"session_id": session_id, "cleared": True}


@app.get("/sessions")
def get_sessions():
    return {"sessions": session_store.list_sessions()}