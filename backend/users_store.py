
import sqlite3
from datetime import datetime, timezone

import config


def _connect():
    # Add a 30-second timeout to let concurrent requests wait safely for a lock release
    conn = sqlite3.connect(config.SQLITE_DB, timeout=30.0)
    conn.row_factory = sqlite3.Row
    
    # Enable WAL mode (Write-Ahead Logging) to allow concurrent reads + writes safely
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn

def init_db():
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            organization TEXT NOT NULL DEFAULT '',
            org_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
        """
    )
    # Safe migrations for DBs created before these columns existed.
    cur.execute("PRAGMA table_info(users)")
    existing_cols = {row["name"] for row in cur.fetchall()}
    if "organization" not in existing_cols:
        cur.execute("ALTER TABLE users ADD COLUMN organization TEXT NOT NULL DEFAULT ''")
    if "org_id" not in existing_cols:
        cur.execute("ALTER TABLE users ADD COLUMN org_id TEXT NOT NULL DEFAULT ''")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS session_owners (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _row_to_public_user(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "organization": row["organization"],
        "org_id": row["org_id"],
    }


def create_user(name: str, email: str, password_hash: str, role: str, organization: str, org_id: str) -> dict:
    conn = _connect()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (name, email, password_hash, role, organization, org_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                name,
                email.lower().strip(),
                password_hash,
                role.strip(),
                organization.strip(),
                org_id.strip(),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise ValueError("An account with this email already exists.")
    finally:
        # This block is GUARANTEED to execute, preventing database hang-ups
        conn.close()
        
    return get_user_by_id(user_id)

def get_user_by_email_with_hash(email: str):
    """Returns the full row (including password_hash) for login verification."""
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),))
    row = cur.fetchone()
    conn.close()
    return row


def get_user_by_id(user_id: int):
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return _row_to_public_user(row) if row else None


# --------------------------------------------------------------------------
# Admin Database Helpers
# --------------------------------------------------------------------------

def get_all_users():
    """Queries the database to return all users."""
    conn = _connect()  # Uses your real database path config.SQLITE_DB
    cur = conn.cursor()
    
    cur.execute("SELECT id, name, email, role, organization, org_id FROM users")
    rows = cur.fetchall()
    
    users = [dict(row) for row in rows]
    conn.close()
    return users

def delete_user_by_id(user_id: str):
    """Deletes a user from the sqlite database by ID."""
    conn = _connect()  # Uses your real database path config.SQLITE_DB
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

# --------------------------------------------------------------------------
# Session ownership
# --------------------------------------------------------------------------
def get_session_owner(session_id: str):
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT user_id FROM session_owners WHERE session_id = ?", (session_id,))
    row = cur.fetchone()
    conn.close()
    return row["user_id"] if row else None


def claim_session(session_id: str, user_id: int):
    """Record that this session belongs to this user, if not already owned."""
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "INSERT OR IGNORE INTO session_owners (session_id, user_id, created_at) VALUES (?, ?, ?)",
        (session_id, user_id, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()


def get_session_ids_for_user(user_id: int) -> set:
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT session_id FROM session_owners WHERE user_id = ?", (user_id,))
    ids = {row["session_id"] for row in cur.fetchall()}
    conn.close()
    return ids


def delete_session_owner(session_id: str):
    conn = _connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM session_owners WHERE session_id = ?", (session_id,))
    conn.commit()
    conn.close()