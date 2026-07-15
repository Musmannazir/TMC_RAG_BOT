import React from "react";

export default function AuthBrandPanel() {
  const branding = {
    name: "OmniRAG Portal",
    shortName: "OmniRAG",
  };

  return (
    <div className="auth-brand-panel">
      <div className="auth-brand-glow" />
      <div className="auth-brand-noise" />

      {/* Top Section */}
      <div className="auth-brand-top">
        <div className="auth-logo-row">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--auth-primary, #38bdf8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <div>
            <span className="auth-brand">{branding.shortName}</span>
            <span className="auth-subbrand">Secure Knowledge Base</span>
          </div>
        </div>
      </div>

      {/* Middle Capabilities Section */}
      <div className="auth-brand-middle">
        <h1 className="auth-tagline">
          Your knowledge, <span>isolated & indexed.</span>
        </h1>
        <p className="auth-blurb">
          Access the secure RAG document store. All chat logs, queries, and contextual outputs are completely isolated.
        </p>

        {/* Custom Stat Layout cards */}
        <div className="auth-stats">
          <div className="auth-stat-card">
            <p className="auth-stat-number accent">100%</p>
            <p className="auth-stat-label">Isolated Storage</p>
          </div>
          <div className="auth-stat-card">
            <p className="auth-stat-number primary">Active</p>
            <p className="auth-stat-label">Secure Access Status</p>
          </div>
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className="auth-brand-footer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>Secure Enterprise Gateway Active</span>
      </div>
    </div>
  );
}