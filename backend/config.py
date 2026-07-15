import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

_data_dirs_raw = os.getenv("DATA_DIR", "./DATA")

# 2. Split by comma, strip whitespace, resolve each path, and store them in a list
DATA_DIRS = [Path(p.strip()).resolve() for p in _data_dirs_raw.split(",")]
VECTORSTORE_DIR = Path(os.getenv("VECTORSTORE_DIR", "./faiss_index")).resolve()
SQLITE_DB = Path(os.getenv("SQLITE_DB", "./sessions.db")).resolve()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))
TOP_K = int(os.getenv("TOP_K", "4"))

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:8501")

# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-change-me-in-env")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24 * 7)))  # 7 days


TMC_ORG_ID = "tmc"

DOMAIN_CONFIG = {
    "tmcltd.com":   {"org_id": TMC_ORG_ID, "organization": "TMC", "internal": True},
    "pgc.com":      {"org_id": "pgc",      "organization": "PGC (Punjab Group)", "internal": False},
    "giki.edu.pk":  {"org_id": "giki",     "organization": "GIKI", "internal": False},
    "lums.edu.pk":  {"org_id": "lums",     "organization": "LUMS", "internal": False},
    "nust.edu.pk":  {"org_id": "nust",     "organization": "NUST", "internal": False},
    "bytetech.com": {"org_id": "bytetech", "organization": "ByteTech", "internal": False},
    "nexora.com":   {"org_id": "nexora",   "organization": "Nexora", "internal": False},
}


TMC_INTERNAL_DOMAINS = {"tallymarksconsulting.com", "tmcltd.com"}

# Role values treated as "admin" (cross-organization visibility). "hr" is
# assigned automatically to TMC_INTERNAL_DOMAINS above; this set is what
# auth.is_admin_role() checks against.
ADMIN_ROLES = {r.strip().lower() for r in os.getenv("ADMIN_ROLES", "hr").split(",") if r.strip()}

DEBUG_TIMING = os.getenv("DEBUG_TIMING", "false").lower() == "true"

if not GROQ_API_KEY:
    # Don't crash on import (so `python -m` tooling / eval scripts still work),
    # but every real request will fail loudly and clearly in main.py.
    pass