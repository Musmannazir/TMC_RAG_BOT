import React, { useState, useRef, useEffect } from "react";

/**
 * Chat input box: auto-growing textarea + send button.
 * Enter sends, Shift+Enter adds a newline.
 * Now with automatic auto-focus!
 */
export default function ChatInput({ onSend, disabled = false, isLoading = false, placeholder = "Ask a question..." }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  // Support both "disabled" and "isLoading" props for compatibility
  const isWorking = disabled || isLoading;

  // 1. Auto-resize textarea height as user types
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // 2. 🔥 THE FIX: Auto-focus the input box on load, and as soon as AI finishes responding!
  useEffect(() => {
    if (!isWorking && textareaRef.current) {
      // Focus after a tiny microtask to let React finish mounting/enabling the element
      setTimeout(() => {
        textareaRef.current.focus();
      }, 50);
    }
  }, [isWorking]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isWorking) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-shell">
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={isWorking}
      />
      <button
        className="send-btn"
        onClick={handleSend}
        disabled={isWorking || !value.trim()}
        aria-label="Send message"
      >
        {isWorking ? (
          <span className="dash-pulse-dot">●</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}