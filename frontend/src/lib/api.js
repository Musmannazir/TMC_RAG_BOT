import { authHeader, logout } from "./auth.js";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

/** Small helper: fetch with a timeout, since the browser fetch API has none built in. */
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/** If the backend says our token is invalid/expired, clear it and send the
 * user back to the login page rather than silently failing. */
function _handleAuthFailure(status) {
  if (status === 401) {
    logout();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return true;
  }
  return false;
}

/** GET /health — used for the sidebar status dot. Public, no auth needed. */
export async function checkBackend() {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/health`, {}, 4000);
    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}

/** GET /sessions — list of past conversations for the sidebar (scoped to the logged-in user). */
export async function fetchSessions() {
  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/sessions`,
      { headers: { ...authHeader() } },
      5000
    );
    if (_handleAuthFailure(res.status)) return [];
    if (res.ok) {
      const data = await res.json();
      return data.sessions || [];
    }
  } catch {
    // swallow — sidebar just shows "no conversations"
  }
  return [];
}

/** GET /history/:sessionId — hydrate a conversation's messages. */
export async function fetchHistory(sessionId) {
  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/history/${sessionId}`,
      { headers: { ...authHeader() } },
      5000
    );
    if (_handleAuthFailure(res.status)) return [];
    if (res.ok) {
      const data = await res.json();
      const hydrated = data.messages || [];
      return hydrated.map((m) => ({
        role: m.role,
        content: m.content,
        citations: [],
        time: null,
      }));
    }
  } catch {
    // swallow — start with an empty conversation
  }
  return [];
}

/** DELETE /history/:sessionId */
export async function deleteSession(sessionId) {
  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/history/${sessionId}`,
      { method: "DELETE", headers: { ...authHeader() } },
      5000
    );
    _handleAuthFailure(res.status);
  } catch {
    // best-effort, same as the Streamlit version
  }
}

/**
 * POST /ask/stream — Server-Sent-Events style stream.
 * Mirrors the Streamlit app's line-by-line "data: {...}" parsing.
 *
 * callbacks:
 *   onToken(chunk)      — a token of the answer arrived
 *   onCitations(list)   — citation list arrived
 *   onError(detail)     — backend reported an error
 *   onDone()            — stream finished
 */
export async function streamAsk(question, sessionId, { onToken, onCitations, onError, onDone }) {
  let response;
  try {
    response = await fetch(`${BACKEND_URL}/ask/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ question, session_id: sessionId }),
    });
  } catch (err) {
    if (err.name === "AbortError") {
      onError("The request timed out. The model may be under heavy load — try again.");
    } else {
      onError(`Can't reach the backend at ${BACKEND_URL}. Make sure uvicorn main:app is running.`);
    }
    return;
  }

  if (_handleAuthFailure(response.status)) {
    onError("Your session has expired. Please log in again.");
    return;
  }

  if (!response.ok) {
    onError(`Something went wrong on the backend (${response.status}). Please try again.`);
    return;
  }

  if (!response.body) {
    onError("Streaming isn't supported by this browser response.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep the last (possibly partial) line for next chunk

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith("data: ")) continue;
        let event;
        try {
          event = JSON.parse(line.slice("data: ".length));
        } catch {
          continue;
        }
        const etype = event.type;
        if (etype === "token") {
          onToken(event.content ?? "");
        } else if (etype === "citations") {
          onCitations(event.citations ?? []);
        } else if (etype === "error") {
          onError(event.detail || "Something went wrong.");
        } else if (etype === "done") {
          onDone();
          return;
        }
      }
    }
    onDone();
  } catch (err) {
    onError("The connection to the backend was interrupted. Please try again.");
  }
}