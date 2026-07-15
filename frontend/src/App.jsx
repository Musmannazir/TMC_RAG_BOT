import React, { useEffect, useState, useRef } from "react";
import ChatInput from "./components/ChatInput";
import { getToken, logout } from "./lib/auth.js";
import "./styles/App.css"; // Adjusted for your styles directory structure

const branding = {
  name: "OmniRAG Portal",
  shortName: "OmniRAG",
};

// Helper to support both 'id' and 'session_id' backend structures safely
const getSessionId = (session) => {
  return session?.id || session?.session_id;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  
  // Track which session's three-dots menu is currently open
  const [activeMenuSessionId, setActiveMenuSessionId] = useState(null);

  const messagesEndRef = useRef(null);

  // Formats current time into HH:MM AM/PM
  const getFormattedTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // 1. Run authorization token verification on mount
  useEffect(() => {
    const fetchUserAndData = async () => {
      try {
        const token = getToken();
        
        if (!token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch("http://localhost:8000/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Unauthorized Token Context");
        const userData = await res.json();
        setUser(userData);

        // Fetch past sessions first
        await fetchSessions(token);

      } catch (err) {
        console.error("Session verification loop failure:", err);
        logout();
        window.location.href = "/login";
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUserAndData();

    // Close any open context dropdown menus when clicking outside
    const handleOutsideClick = () => setActiveMenuSessionId(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // 2. Fetch past chat sessions (persisted from sessions.db)
  const fetchSessions = async (token) => {
    try {
      const activeToken = token || getToken();
      const res = await fetch("http://localhost:8000/sessions", {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const fetchedSessions = data.sessions || [];
        setSessions(fetchedSessions);

        // PERSISTENCE: Restore the last active session ID from localStorage on page refresh
        const savedSessionId = localStorage.getItem("tmc_current_session_id");
        const sessionExists = fetchedSessions.some(s => getSessionId(s) === savedSessionId);
        
        if (savedSessionId && sessionExists) {
          setCurrentSessionId(savedSessionId);
        }
      }
    } catch (err) {
      console.error("Could not fetch user history sessions:", err);
    }
  };

  // 3. Reload historical message items when thread context changes
  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }

    const fetchHistory = async () => {
      setLoadingChat(true);
      try {
        const token = getToken();
        const res = await fetch(`http://localhost:8000/history/${currentSessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const hydrated = (data.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
            time: m.time || getFormattedTime(),
          }));
          setMessages(hydrated);
        }
      } catch (err) {
        console.error("Failed to load timeline records:", err);
      } finally {
        setLoadingChat(false);
      }
    };

    fetchHistory();
  }, [currentSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // 4. Send Message Handler
  const handleSendMessage = async (text) => {
    if (!text.trim() || sending) return;

    const token = getToken();
    setSending(true);

    const currentTimeStamp = getFormattedTime();
    const userMessage = { role: "user", content: text, time: currentTimeStamp };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: text,
          session_id: currentSessionId,
        }),
      });

      if (!res.ok) throw new Error("Processing loop exception occurred.");
      const data = await res.json();

      const assistantTimeStamp = getFormattedTime();

      if (!currentSessionId && data.session_id) {
        setCurrentSessionId(data.session_id);
        localStorage.setItem("tmc_current_session_id", data.session_id); // Save on creation
        fetchSessions(token);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, time: assistantTimeStamp }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Error processing message context. Please try again.", time: getFormattedTime() },
      ]);
    } finally {
      setSending(false);
    }
  };

  // 5. Delete conversation thread handler
  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm("Are you sure you want to clear this chat log?")) return;

    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/history/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setSessions((prev) => prev.filter((s) => getSessionId(s) !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          localStorage.removeItem("tmc_current_session_id");
        }
      }
    } catch (err) {
      console.error("Could not delete conversation loop:", err);
    }
  };

  const handleNewConversation = () => {
    setCurrentSessionId(null);
    localStorage.removeItem("tmc_current_session_id");
  };

  const handleLogout = () => {
    logout();
    localStorage.removeItem("tmc_current_session_id");
    window.location.href = "/login";
  };

  if (loadingUser) {
    return (
      <div style={{ color: "#00f0ff", textAlign: "center", marginTop: "20%", fontFamily: "sans-serif" }}>
        Verifying Workspace Secure Context Isolation...
      </div>
    );
  }

  return (
    <div className="app-shell">
      
      {/* LEFT SIDEBAR PANEL */}
      <div className="sidebar">
        <div className="sidebar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--tmc-green, #8BC53F)" strokeWidth="2" className="sidebar-logo">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div>
            <div className="sidebar-brand-name">{branding.shortName}</div>
            <div className="sidebar-brand-sub">Isolated Namespace</div>
          </div>
        </div>

        <div className="sidebar-divider" />

        {/* Action Trigger button */}
        <button onClick={handleNewConversation} className="btn btn-primary btn-block" style={{ marginBottom: "14px" }}>
          + New Conversation
        </button>

        {/* Render Sessions Thread List */}
        <div className="sidebar-sessions">
          {sessions.length === 0 ? (
            <p className="sidebar-empty">No past conversations</p>
          ) : (
            sessions.map((session) => {
              const sId = getSessionId(session);
              if (!sId) return null;

              return (
                <div key={sId} className="session-row">
                  <button
                    onClick={() => {
                      setCurrentSessionId(sId);
                      localStorage.setItem("tmc_current_session_id", sId); // Persist select state
                    }}
                    className={`session-btn ${currentSessionId === sId ? "session-btn--active" : ""}`}
                    style={{ paddingRight: "40px" }}
                  >
                    💬 {session.title || `Chat thread #${sId.slice(0, 5)}`}
                  </button>
                  
                  {/* 3-Dots Action Trigger Menu */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuSessionId(
                          activeMenuSessionId === sId ? null : sId
                        );
                      }}
                      className="session-menu-btn"
                      style={{ fontSize: "16px", fontWeight: "bold" }}
                      aria-label="Thread options"
                    >
                      ⋮
                    </button>

                    {/* Dropdown Options Box */}
                    {activeMenuSessionId === sId && (
                      <div className="session-menu" style={{ display: "block", right: "0px", top: "25px" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(sId);
                            setActiveMenuSessionId(null);
                          }}
                          className="session-menu-item session-menu-item--danger"
                        >
                          🗑️ Delete Conversation
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* User Workspace Profile bottom bar footer */}
        <div className="sidebar-footer">
          <div style={{ marginBottom: "14px" }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#fff" }}>{user?.name}</p>
            <p style={{ margin: 0, fontSize: "11px", color: "var(--ink-dim)" }}>{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary btn-block">
            Logout
          </button>
        </div>
      </div>

      {/* RIGHT CHAT CONTAINER VIEW AREA */}
      <div className="main-pane">
        
        {/* Top bar control container */}
        <div className="tmc-header">
          <div>
            <p className="tmc-title">
              {currentSessionId ? "Secure Thread Context" : "New Assistant Environment Entry"}
            </p>
            <p className="tmc-subtitle">
              {currentSessionId ? `${currentSessionId.slice(0, 15)}...` : "Isolated execution workspace"}
            </p>
          </div>
          {user?.role === "admin" && (
            <a href="/admin" className="btn btn-secondary" style={{ marginLeft: "auto" }}>
              Admin Dashboard
            </a>
          )}
        </div>

        {/* Dynamic Log Message space feed wrapper */}
        <div className="chat-scroll">
          {messages.length === 0 && !loadingChat && (
            <div className="welcome">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--tmc-green, #8BC53F)" strokeWidth="1.5" className="welcome-logo">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <h3>Welcome to {branding.shortName} AI Portal</h3>
              <p>
                The secure execution chain has isolated this window context. Ask any question below to extract parameters from your workspace repository.
              </p>
            </div>
          )}

          {loadingChat ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--ink-faint)" }}>
              Retrieving encrypted store vectors...
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role === "user" ? "chat-message--user" : "chat-message--assistant"}`}>
                <div className="bubble">
                  <div className="bubble-content">
                    <p>{msg.content}</p>
                  </div>
                  {msg.time && (
                    <div style={{ 
                      fontSize: "10px", 
                      color: "rgba(255, 255, 255, 0.4)", 
                      marginTop: "6px", 
                      textAlign: msg.role === "user" ? "right" : "left" 
                    }}>
                      {msg.time}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="chat-message chat-message--assistant">
              <div className="bubble">
                <div className="bubble-content">
                  <span className="cursor-blink">●</span> Synthesizing contextual prompt index models...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Fixed Chat Input Control Wrapper Footer */}
        <div className="chat-input-bar">
          <ChatInput 
            onSend={handleSendMessage} 
            disabled={sending || loadingChat} 
          />
        </div>
      </div>

    </div>
  );
}