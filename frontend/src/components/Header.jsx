import React from "react";

export default function Header({ onOpenSidebar }) {
  return (
    <div className="tmc-header">
      <button className="hamburger" onClick={onOpenSidebar} aria-label="Open menu">
        <span />
        <span />
        <span />
      </button>
      <img src="/logo.png" className="tmc-logo-img" alt="TMC logo" />
      <div>
        <p className="tmc-title">TMC Policy Assistant</p>
        <p className="tmc-subtitle">Ask anything about TMC HR policies — grounded, cited, always accurate</p>
      </div>
    </div>
  );
}
