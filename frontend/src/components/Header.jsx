import React from "react";
import { useNavigate } from "react-router-dom";
import { getUser, logout } from "../lib/auth.js";

export default function Header({ onOpenSidebar }) {
  const navigate = useNavigate();
  const user = getUser();

  // Static/Unified branding fallback
  const branding = {
    shortName: "OmniRAG",
    subtitle: "Ask anything about organizational policies — grounded, cited, always accurate",
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="tmc-header">
      <button className="hamburger" onClick={onOpenSidebar} aria-label="Open menu">
        <span />
        <span />
        <span />
      </button>

      {/* Replaced dynamic logo lookup with a consistent, sharp inline SVG */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--auth-brand-accent, #00f0ff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
        <div>
          <p className="tmc-title">{branding.shortName} Policy Assistant</p>
          <p className="tmc-subtitle">{branding.subtitle}</p>
        </div>
      </div>

      {user && (
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
              {user.name}
              {(user.role === "hr" || user.role === "admin") && (
                <span
                  style={{
                    marginLeft: "6px",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#020408",
                    background: "var(--auth-brand-accent, #00f0ff)",
                    borderRadius: "999px",
                    padding: "2px 7px",
                    verticalAlign: "middle",
                  }}
                >
                  ADMIN
                </span>
              )}
            </div>
            {user.organization && (
              <div style={{ fontSize: "11px", color: "var(--auth-brand-accent, #00f0ff)", fontWeight: 600 }}>
                {user.organization}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "transparent",
              border: "1px solid rgba(0, 240, 255, 0.4)",
              color: "#DCE4EE",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}