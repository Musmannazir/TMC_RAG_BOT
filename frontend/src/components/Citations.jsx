import React, { useState } from "react";

export default function Citations({ citations }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;

  return (
    <div className="citations">
      <button className="citations-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`citations-chevron ${open ? "citations-chevron--open" : ""}`}>▸</span>
        📎 Sources ({citations.length})
      </button>
      {open && (
        <div className="citations-list">
          {citations.map((c, idx) => (
            <div className="citation-box" key={idx}>
              <b>{c.source}</b> — page {c.page}
              <br />
              {c.snippet}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
