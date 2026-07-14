"""
Central config. Every other module imports settings from here so there's
a single source of truth for paths, model names, and chunking params.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

DATA_DIR = Path(os.getenv("DATA_DIR", "./TMC_Data")).resolve()
VECTORSTORE_DIR = Path(os.getenv("VECTORSTORE_DIR", "./faiss_index")).resolve()
SQLITE_DB = Path(os.getenv("SQLITE_DB", "./sessions.db")).resolve()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))
TOP_K = int(os.getenv("TOP_K", "4"))

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:8501")

if not GROQ_API_KEY:
    # Don't crash on import (so `python -m` tooling / eval scripts still work),
    # but every real request will fail loudly and clearly in main.py.
    pass