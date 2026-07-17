import json
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, field_validator
from Admin import router as admin_router
import config
import session_store
import users_store
import auth
from rag_chain import ask as rag_ask, ask_stream as rag_ask_stream

app = FastAPI(title="Multi-Tenant Policy RAG API", version="1.2.0")

app.include_router(admin_router)

users_store.init_db()

app.add_middleware(
    CORSMiddleware,
  allow_origins=[
        config.FRONTEND_ORIGIN,
        "http://localhost:5173", "http://127.0.0.1:5173",
        "https://tmc-rag-bot.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class AskRequest(BaseModel):
    question: str
    session_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    citations: list[dict]
    session_id: str


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        return v

    @field_validator("name")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("This field cannot be blank.")
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    organization: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --------------------------------------------------------------------------
# Health (public)
# --------------------------------------------------------------------------
@app.get("/health")
def health():
    vectorstore_ready = (config.VECTORSTORE_DIR / "index.faiss").exists()
    return {
        "status": "ok",
        "vectorstore_ready": vectorstore_ready,
        "groq_key_set": bool(config.GROQ_API_KEY),
    }


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
@app.post("/auth/signup", response_model=TokenResponse)
def signup(payload: SignupRequest):
    org_id, organization, role = auth.resolve_org_identity(payload.email)
    password_hash = auth.hash_password(payload.password)
    try:
        user = users_store.create_user(payload.name, payload.email, password_hash, role, organization, org_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    token = auth.create_access_token(user)
    return TokenResponse(access_token=token, user=UserOut(**user))


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    row = users_store.get_user_by_email_with_hash(payload.email)
    if row is None or not auth.verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    user = {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "organization": row["organization"],
        "org_id": row["org_id"],
    }
    token = auth.create_access_token(user)
    return TokenResponse(access_token=token, user=UserOut(**user))


@app.get("/auth/me", response_model=UserOut)
def me(current_user: dict = Depends(auth.get_current_user)):
    return UserOut(**current_user)


# --------------------------------------------------------------------------
# Chat (all require auth)
# --------------------------------------------------------------------------
def _validate_request(payload: AskRequest, current_user: dict):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question cannot be empty")
    if not (config.VECTORSTORE_DIR / "index.faiss").exists():
        raise HTTPException(
            status_code=503,
            detail="Vector store not found. Run `python ingest.py` first to index the DATA_DIR documents.",
        )
    session_id = payload.session_id or str(uuid4())
    _authorize_session(session_id, current_user, claim_if_new=True)
    return question, session_id


def _authorize_session(session_id: str, current_user: dict, claim_if_new: bool = False):
    """Raise 403 if this session belongs to someone else. If nobody owns it
    yet and claim_if_new is True, the current user becomes its owner."""
    owner_id = users_store.get_session_owner(session_id)
    if owner_id is None:
        if claim_if_new:
            users_store.claim_session(session_id, current_user["id"])
        return
    if owner_id != current_user["id"] and not auth.is_admin_role(current_user["role"]):
        raise HTTPException(status_code=403, detail="You don't have access to this conversation.")


@app.post("/ask", response_model=AskResponse)
def ask(payload: AskRequest, current_user: dict = Depends(auth.get_current_user)):
    question, session_id = _validate_request(payload, current_user)
    try:
        result = rag_ask(question, session_id, current_user["org_id"], current_user["role"])
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

    return AskResponse(answer=result["answer"], citations=result["citations"], session_id=session_id)


@app.post("/ask/stream")
def ask_stream(payload: AskRequest, current_user: dict = Depends(auth.get_current_user)):
    question, session_id = _validate_request(payload, current_user)
    org_id = current_user["org_id"]
    user_role = current_user["role"]

    def event_generator():
        yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        try:
            for event in rag_ask_stream(question, session_id, org_id, user_role):
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
def get_history(session_id: str, current_user: dict = Depends(auth.get_current_user)):
    _authorize_session(session_id, current_user, claim_if_new=False)
    return {"session_id": session_id, "messages": session_store.list_messages(session_id)}


@app.delete("/history/{session_id}")
def delete_history(session_id: str, current_user: dict = Depends(auth.get_current_user)):
    _authorize_session(session_id, current_user, claim_if_new=False)
    session_store.clear_session(session_id)
    users_store.delete_session_owner(session_id)
    return {"session_id": session_id, "cleared": True}


@app.get("/sessions")
def get_sessions(current_user: dict = Depends(auth.get_current_user)):
    if auth.is_admin_role(current_user["role"]):
        sessions = session_store.list_sessions()  # admins (e.g. HR) see everyone's conversations
    else:
        owned = users_store.get_session_ids_for_user(current_user["id"])
        sessions = session_store.list_sessions(allowed_session_ids=owned)
    return {"sessions": sessions}
