import json
import sqlite3

from langchain_community.chat_message_histories import SQLChatMessageHistory

import config


def get_session_history(session_id: str) -> SQLChatMessageHistory:
    return SQLChatMessageHistory(
        session_id=session_id,
        connection=f"sqlite:///{config.SQLITE_DB}",
    )


def list_messages(session_id: str):
    history = get_session_history(session_id)
    return [
        {"role": "user" if m.type == "human" else "assistant", "content": m.content}
        for m in history.messages
    ]


def clear_session(session_id: str):
    get_session_history(session_id).clear()


def list_sessions(limit: int = 50, allowed_session_ids: set | None = None):
    if allowed_session_ids is not None and len(allowed_session_ids) == 0:
        return []

    conn = sqlite3.connect(config.SQLITE_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    if allowed_session_ids is not None:
        placeholders = ",".join("?" for _ in allowed_session_ids)
        cur.execute(
            f"""
            SELECT session_id, MAX(id) AS last_id
            FROM message_store
            WHERE session_id IN ({placeholders})
            GROUP BY session_id
            ORDER BY last_id DESC
            LIMIT ?
            """,
            (*allowed_session_ids, limit),
        )
    else:
        cur.execute(
            """
            SELECT session_id, MAX(id) AS last_id
            FROM message_store
            GROUP BY session_id
            ORDER BY last_id DESC
            LIMIT ?
            """,
            (limit,),
        )
    rows = cur.fetchall()

    sessions = []
    for row in rows:
        session_id = row["session_id"]
        cur.execute(
            "SELECT message FROM message_store WHERE session_id = ? ORDER BY id ASC",
            (session_id,),
        )
        title = "New conversation"
        for (msg_json,) in cur.fetchall():
            msg = json.loads(msg_json)
            if msg.get("type") == "human":
                content = msg.get("data", {}).get("content", "")
                title = content[:60] + ("..." if len(content) > 60 else "")
                break
        sessions.append({"session_id": session_id, "title": title})

    conn.close()
    return sessions