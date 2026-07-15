import React, { useState } from "react";
import { getUser } from "../lib/auth.js";
import { getTenantBranding } from "../lib/tenantThemes";

const KB_DOCS = [
  "Attendance & Leave",
  "Dress Code",
  "International Travel",
  "Loan",
  "Maternity",
  "TADA",
  "Ethics Guidelines",
  "OPD",
  "Business Conduct",
];

function StatusPill({ health }) {
  let color = "#FF453A";
  let label = "Backend unreachable";
  if (health) {
    if (health.vectorstore_ready) {
      color = "#4CD964";
      label = "Online — knowledge base loaded";
    } else {
      color = "#F5A623";
      label = "Online — run ingest.py first";
    }
  }
  return (
    <div className="status-pill">
      <span className="status-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span>{label}</span>
    </div>
  );
}

export default function Sidebar({
  health,
  sessions,
  currentSessionId,
  onNewConversation,
  onSwitchSession,
  onDeleteSession,
  isOpen,
  onClose,
}) {
  const [menuOpenId, setMenuOpenId] = useState(null);
  const user = getUser();
  const branding = getTenantBranding(user?.org_id);

  return (
    <>
      {isOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-brand">
          <img src={branding.logo} alt={`${branding.shortName} logo`} className="sidebar-logo" />
          <div>
            <div className="sidebar-brand-name">{branding.shortName}</div>
            <div className="sidebar-brand-sub">{branding.name.toUpperCase()}</div>
          </div>
        </div>

        <div className="sidebar-divider" />

        <StatusPill health={health} />

        <button className="btn btn-primary btn-block" onClick={onNewConversation}>
          <span className="btn-icon">+</span> New conversation
        </button>

        <div className="sidebar-section-label">Past conversations</div>
        <div className="sidebar-sessions">
          {sessions.length === 0 && <p className="sidebar-empty">No past conversations yet.</p>}
          {sessions.map((s) => {
            const isCurrent = s.session_id === currentSessionId;
            const menuOpen = menuOpenId === s.session_id;
            return (
              <div className="session-row" key={s.session_id}>
                <button
                  className={`session-btn ${isCurrent ? "session-btn--active" : ""}`}
                  onClick={() => onSwitchSession(s.session_id)}
                  title={s.title}
                >
                  {s.title || "Untitled conversation"}
                </button>
                <button
                  className="session-menu-btn"
                  onClick={() => setMenuOpenId(menuOpen ? null : s.session_id)}
                  aria-label="Conversation options"
                >
                  ⋮
                </button>
                {menuOpen && (
                  <div className="session-menu">
                    <button
                      className="session-menu-item session-menu-item--danger"
                      onClick={() => {
                        onDeleteSession(s.session_id);
                        setMenuOpenId(null);
                      }}
                    >
                      🗑 Delete this conversation
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-section-label">Knowledge base</div>
        <p className="sidebar-caption">{KB_DOCS.join(" · ")}</p>

        <details className="sidebar-details">
          <summary>Session details</summary>
          <code className="sidebar-session-id">{currentSessionId}</code>
          <p className="sidebar-caption">This ID keeps your conversation isolated and persists across page refresh.</p>
        </details>

        <p className="sidebar-footer">
          {branding.shortName} Policy Assistant · Internal RAG tool · Answers are grounded strictly in official {branding.shortName} documents.
        </p>
      </aside>
    </>
  );
}