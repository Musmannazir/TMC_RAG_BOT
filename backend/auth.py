import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

import config
import users_store

TMC_ORG_ID = config.TMC_ORG_ID

# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------
def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # malformed hash in the DB — treat as "doesn't match" rather than crashing
        return False


# --------------------------------------------------------------------------
# JWT
# --------------------------------------------------------------------------
def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "org_id": user["org_id"],
        "iat": now,
        "exp": now + timedelta(minutes=config.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token.")


# --------------------------------------------------------------------------
# FastAPI dependencies
# --------------------------------------------------------------------------
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme)) -> dict:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )
    payload = decode_access_token(credentials.credentials)
    user = users_store.get_user_by_id(int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists.")
    return user


def is_admin_role(role: str) -> bool:
    return (role or "").strip().lower() in config.ADMIN_ROLES


def resolve_org_identity(email: str) -> tuple[str, str, str]:

    domain = email.split("@")[-1].lower().strip()

    entry = config.DOMAIN_CONFIG.get(domain)
    if entry is not None:
        return entry["org_id"], entry["organization"], ("hr" if domain in config.TMC_INTERNAL_DOMAINS else "employee")
    
    base = domain.split(".")[0]
    org_id = base.strip() or "unknown"
    organization = base.replace("-", " ").replace("_", " ").title() or "Unknown"
    role = "hr" if domain in config.TMC_INTERNAL_DOMAINS else "employee"
    return org_id, organization, role


def build_retrieval_filter(org_id: str):

    if org_id == TMC_ORG_ID:
        def _filter(metadata: dict) -> bool:
            return metadata.get("org_id") == TMC_ORG_ID
        return _filter

    def _filter(metadata: dict) -> bool:
        if metadata.get("org_id") == org_id:
            return True
        if metadata.get("org_id") == TMC_ORG_ID and metadata.get("visibility") == "public":
            return True
        return False

    return _filter


def require_role(*allowed_roles: str):
    allowed_lower = {r.lower() for r in allowed_roles}

    def _dependency(current_user: dict = Depends(get_current_user)) -> dict:
        role = (current_user.get("role") or "").lower()
        if role in allowed_lower or is_admin_role(role):
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to perform this action.",
        )

    return _dependency