import React, { useState } from "react";
import Citations from "./Citations.jsx";
import { renderMarkdown } from "../lib/markdown.js";

export default function ChatMessage({ msg, isEditing, onStartEdit, onSaveEdit, onCancelEdit, isStreaming }) {
  const [draft, setDraft] = useState(msg.content);
  const isUser = msg.role === "user";

  if (isEditing) {
    return (
      <div className="chat-message chat-message--user">
        <div className="bubble bubble--edit">
          <textarea
            className="edit-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
          />
          <div className="edit-actions">
            <button className="btn btn-primary" onClick={() => onSaveEdit(draft)}>
              💾 Save &amp; resend
            </button>
            <button className="btn btn-secondary" onClick={onCancelEdit}>
              ✖ Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-message ${isUser ? "chat-message--user" : "chat-message--assistant"}`}>
      <div className="bubble">
        <div
          className="bubble-content"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
        />
        {isStreaming && <span className="cursor-blink">▌</span>}
        {msg.time && <div className="msg-time">{msg.time}</div>}
        {isUser && !isStreaming && (
          <button className="edit-btn" onClick={onStartEdit}>
            ✏️ Edit
          </button>
        )}
        {!isUser && <Citations citations={msg.citations} />}
      </div>
    </div>
  );
}
