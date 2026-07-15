import React from "react";
import { getUser } from "../lib/auth.js";

const SUGGESTIONS = [
  "How many casual leaves do I get?",
  "What's the dress code policy?",
  "How does international travel reimbursement work?",
  "What are the maternity leave benefits?",
];

export default function WelcomeScreen({ onSuggestionClick }) {
  const user = getUser();
  const branding = {
    shortName: "OmniRAG",
  };

  return (
    <div className="welcome">
      {/* High-tech static fallback SVG */}
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--tmc-green, #8BC53F)" strokeWidth="1.5" className="welcome-logo" style={{ marginBottom: "14px" }}>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <h3>Welcome to the {branding.shortName} Policy Assistant</h3>
      <p>Ask about leave policy, dress code, travel, loans, maternity, TADA, ethics, OPD, or business conduct.</p>
      <div className="welcome-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="suggestion-chip" onClick={() => onSuggestionClick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}