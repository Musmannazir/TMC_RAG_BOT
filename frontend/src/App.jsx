import React, { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Header from "./components/Header.jsx";
import WelcomeScreen from "./components/WelcomeScreen.jsx";
import ChatMessage from "./components/ChatMessage.jsx";
import ChatInput from "./components/ChatInput.jsx";
import { checkBackend, fetchSessions, fetchHistory, deleteSession, streamAsk } from "./lib/api.js";
import { newSessionId, getSessionIdFromUrl, setSessionIdInUrl } from "./lib/session.js";
import "./styles/App.css";

const nowLabel = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function App() {
  const [sessionId, setSessionId] = useState(() => {
    const fromUrl = getSessionIdFromUrl();
    if (fromUrl) return fromUrl;
    const id = newSessionId();
    return id;
  });
  const [messages, setMessages] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const [streamingIndex, setStreamingIndex] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [health, setHealth] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollAnchorRef = useRef(null);
  const initializedRef = useRef(false);

  const refreshSessions = useCallback(() => {
    fetchSessions().then(setSessions);
  }, []);

  const refreshHealth = useCallback(() => {
    checkBackend().then(setHealth);
  }, []);

  // First load: make sure the URL carries the session id, then hydrate.
  useEffect(() => {
    setSessionIdInUrl(sessionId);
    fetchHistory(sessionId).then(setMessages);
    refreshSessions();
    refreshHealth();
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll health + session list, mirroring the Streamlit app's ttl=5 caches.
  useEffect(() => {
    const id = setInterval(() => {
      refreshHealth();
      refreshSessions();
    }, 5000);
    return () => clearInterval(id);
  }, [refreshHealth, refreshSessions]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingIndex]);

  const sendMessage = useCallback(
    (question) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      setMessages((prev) => {
        const userMsg = { role: "user", content: trimmed, citations: [], time: nowLabel() };
        const assistantMsg = { role: "assistant", content: "", citations: [], time: null };
        const next = [...prev, userMsg, assistantMsg];
        setStreamingIndex(next.length - 1);
        return next;
      });

      const applyToLast = (updater) => {
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          next[lastIdx] = updater(next[lastIdx]);
          return next;
        });
      };

      streamAsk(trimmed, sessionId, {
        onToken: (chunk) => {
          applyToLast((m) => ({ ...m, content: (m.content || "") + chunk }));
        },
        onCitations: (citations) => {
          applyToLast((m) => ({ ...m, citations }));
        },
        onError: (detail) => {
          applyToLast((m) => ({ ...m, content: `⚠️ ${detail}` }));
        },
        onDone: () => {
          applyToLast((m) => {
            const finalContent =
              m.content && m.content.trim().length > 0
                ? m.content
                : "I don't have that information in the TMC policy documents I have access to.";
            return { ...m, content: finalContent, time: nowLabel() };
          });
          setStreamingIndex(null);
          refreshSessions();
        },
      });
    },
    [sessionId, refreshSessions]
  );

  const newConversation = useCallback(() => {
    const id = newSessionId();
    setSessionId(id);
    setSessionIdInUrl(id);
    setMessages([]);
    setEditIndex(null);
    setSidebarOpen(false);
  }, []);

  const switchSession = useCallback((id) => {
    setSessionId(id);
    setSessionIdInUrl(id);
    setEditIndex(null);
    setSidebarOpen(false);
    fetchHistory(id).then(setMessages);
  }, []);

  const removeSession = useCallback(
    async (id) => {
      await deleteSession(id);
      refreshSessions();
      if (id === sessionId) {
        newConversation();
      }
    },
    [sessionId, refreshSessions, newConversation]
  );

  const handleSaveEdit = useCallback(
    (idx, newText) => {
      setMessages((prev) => prev.slice(0, idx));
      setEditIndex(null);
      sendMessage(newText);
    },
    [sendMessage]
  );

  return (
    <div className="app-shell">
      <Sidebar
        health={health}
        sessions={sessions}
        currentSessionId={sessionId}
        onNewConversation={newConversation}
        onSwitchSession={switchSession}
        onDeleteSession={removeSession}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-pane">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />

        <div className="chat-scroll">
          {messages.length === 0 && <WelcomeScreen onSuggestionClick={sendMessage} />}

          {messages.map((msg, idx) => (
            <ChatMessage
              key={idx}
              msg={msg}
              isEditing={editIndex === idx}
              isStreaming={streamingIndex === idx}
              onStartEdit={() => setEditIndex(idx)}
              onSaveEdit={(text) => handleSaveEdit(idx, text)}
              onCancelEdit={() => setEditIndex(null)}
            />
          ))}
          <div ref={scrollAnchorRef} />
        </div>

        <ChatInput onSend={sendMessage} disabled={streamingIndex !== null} />
      </main>
    </div>
  );
}
