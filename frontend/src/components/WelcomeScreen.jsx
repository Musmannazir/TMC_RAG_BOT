import React from "react";

const SUGGESTIONS = [
  "How many casual leaves do I get?",
  "What's the dress code policy?",
  "How does international travel reimbursement work?",
  "What are the maternity leave benefits?",
];

export default function WelcomeScreen({ onSuggestionClick }) {
  return (
    <div className="welcome">
      <img src="/logo.png" alt="TMC" className="welcome-logo" />
      <h3>Welcome to the TMC Policy Assistant</h3>
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
