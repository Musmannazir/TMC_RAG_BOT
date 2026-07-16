import sys
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

import config

_LOADABLE_SUFFIXES = (".pdf", ".txt")


def _iter_source_files(data_dir: Path):
    for entry in sorted(data_dir.iterdir()):
        if entry.is_file():
            if entry.suffix.lower() not in _LOADABLE_SUFFIXES:
                continue
            org_id = entry.stem.lower().strip()
            yield entry, org_id, "full"

        elif entry.is_dir():
            org_dir = entry
            org_id = org_dir.name.lower().strip()
            for path in sorted(org_dir.rglob("*")):
                if not path.is_file() or path.suffix.lower() not in _LOADABLE_SUFFIXES:
                    continue

                rel_parts = path.relative_to(org_dir).parts
                if org_id == config.TMC_ORG_ID and len(rel_parts) > 1 and rel_parts[0] in ("public", "policy"):
                    visibility = rel_parts[0]
                else:
                    visibility = "full"

                yield path, org_id, visibility


def _load_single_file(path: Path):
    if path.suffix.lower() == ".pdf":
        return PyPDFLoader(str(path)).load()
    return TextLoader(str(path), encoding="utf-8").load()

# backend/ingest.py
import os
from pathlib import Path
from langchain_community.document_loaders import PyPDFLoader, TextLoader

def load_documents(data_dirs):
    documents = []
    for data_dir in data_dirs:
        data_path = Path(data_dir)
        
        # pure DATA directory ko scan karein
        for file_path in data_path.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in [".pdf", ".txt"]:
                try:
                    rel_path = file_path.relative_to(data_path)
                    parts = rel_path.parts # e.g., ('tmc', 'policy', 'Attendance.pdf') ya ('giki', 'GIKI.txt')
                    
                    org_id = parts[0].lower()
                    
                    # Folder ke mutabiq visibility check karein
                    if len(parts) > 2 and parts[1].lower() in ["public", "policy"]:
                        visibility = parts[1].lower()
                    else:
                        visibility = "public" # Fallback/Default for root files
                    
                    # Load file
                    if file_path.suffix.lower() == ".pdf":
                        loader = PyPDFLoader(str(file_path))
                    else:
                        loader = TextLoader(str(file_path), encoding="utf-8")
                    
                    pages = loader.load()
                    
                    # 🏷️ Metadata tagging inside database vectors!
                    for page in pages:
                        page.metadata["org_id"] = org_id
                        page.metadata["visibility"] = visibility
                    
                    documents.extend(pages)
                    print(f"  loaded {rel_path} (org={org_id}, visibility={visibility}): {len(pages)} pages")
                    
                except Exception as e:
                    print(f"\n[Ingest Warning] Skipping corrupt or mislabeled file: {file_path}")
                    print(f"Reason: {str(e)}")
                    continue
                    
    return documents

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
    # Print the directories being read
    dirs_str = ", ".join(str(d) for d in config.DATA_DIRS)
    print(f"Reading documents from: {dirs_str}")
    
    # Pass the list of paths to load_documents
    docs = load_documents(config.DATA_DIRS)

    print("Splitting into chunks...")
    chunks = chunk_documents(docs)
    print(f"  total chunks: {len(chunks)}")

    print(f"Loading embedding model: {config.EMBEDDING_MODEL} (first run downloads it, be patient)")
    embeddings = HuggingFaceEmbeddings(model_name=config.EMBEDDING_MODEL,model_kwargs={'device': 'cpu'},encode_kwargs={'normalize_embeddings': True})

    print(f"Building FAISS index at: {config.VECTORSTORE_DIR}")
    config.VECTORSTORE_DIR.mkdir(parents=True, exist_ok=True)

    vectorstore = FAISS.from_documents(documents=chunks, embedding=embeddings)
    vectorstore.save_local(str(config.VECTORSTORE_DIR))
    print("Done. Vector store persisted to disk.")
    return vectorstore

if __name__ == "__main__":
    build_vectorstore()