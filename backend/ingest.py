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


def load_documents(data_dirs: list[Path]):
    """Iterates through a list of directories and aggregates loaded documents."""
    docs = []
    
    # Iterate through each directory in our configuration list
    for data_dir in data_dirs:
        if not data_dir.exists():
            print(f"Warning: Directory not found: {data_dir}. Skipping...")
            continue
            
        sources = list(_iter_source_files(data_dir))
        if not sources:
            print(f"No documents found under {data_dir}.")
            continue

        for path, org_id, visibility in sources:
            pages = _load_single_file(path)
            for p in pages:
                # Normalize metadata so citations are clean & consistent later.
                p.metadata["source"] = path.name
                p.metadata["page"] = p.metadata.get("page", 0) + 1  # 1-indexed for humans
                # Multi-tenant access control tags
                p.metadata["org_id"] = org_id
                p.metadata["visibility"] = visibility
            docs.extend(pages)
            print(f"  loaded {org_id}/{path.name} (visibility={visibility}): {len(pages)} pages")
            
    if not docs:
        print("No documents were loaded from any of the configured directories. Exiting.")
        sys.exit(1)
        
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
    # Print the directories being read
    dirs_str = ", ".join(str(d) for d in config.DATA_DIRS)
    print(f"Reading documents from: {dirs_str}")
    
    # Pass the list of paths to load_documents
    docs = load_documents(config.DATA_DIRS)

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