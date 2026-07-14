"""
Ingestion pipeline: TMC_Data/*.pdf  ->  chunks  ->  embeddings  ->  FAISS (on disk).

Run standalone:
    python ingest.py

Re-run any time you add/remove/change PDFs in TMC_Data/ — it rebuilds the
collection from scratch so stale chunks never linger.
"""
import sys
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

import config


def load_documents(data_dir: Path):
    pdfs = sorted(data_dir.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {data_dir}. Drop your TMC policy PDFs there first.")
        sys.exit(1)

    docs = []
    for pdf_path in pdfs:
        loader = PyPDFLoader(str(pdf_path))
        pages = loader.load()
        for p in pages:
            # Normalize metadata so citations are clean & consistent later.
            p.metadata["source"] = pdf_path.name
            p.metadata["page"] = p.metadata.get("page", 0) + 1  # 1-indexed for humans
        docs.extend(pages)
        print(f"  loaded {pdf_path.name}: {len(pages)} pages")
    return docs


def chunk_documents(docs):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=config.CHUNK_SIZE,
        chunk_overlap=config.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    # Give every chunk a stable, human-readable section label for citations.
    for i, c in enumerate(chunks):
        c.metadata["chunk_id"] = i
    return chunks


def build_vectorstore():
    print(f"Reading PDFs from: {config.DATA_DIR}")
    docs = load_documents(config.DATA_DIR)

    print("Splitting into chunks...")
    chunks = chunk_documents(docs)
    print(f"  total chunks: {len(chunks)}")

    print(f"Loading embedding model: {config.EMBEDDING_MODEL} (first run downloads it, be patient)")
    embeddings = HuggingFaceEmbeddings(model_name=config.EMBEDDING_MODEL)

    print(f"Building FAISS index at: {config.VECTORSTORE_DIR}")
    config.VECTORSTORE_DIR.mkdir(parents=True, exist_ok=True)

    vectorstore = FAISS.from_documents(documents=chunks, embedding=embeddings)
    vectorstore.save_local(str(config.VECTORSTORE_DIR))
    print("Done. Vector store persisted to disk.")
    return vectorstore


if __name__ == "__main__":
    build_vectorstore()