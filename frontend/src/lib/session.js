/**
 * Session id lives in the URL's ?session_id= query param, exactly like the
 * Streamlit app's st.query_params. Refreshing the page keeps the same
 * conversation; opening a fresh tab with no param starts a new one.
 */

export function newSessionId() {
  return crypto.randomUUID();
}

export function getSessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("session_id");
}

export function setSessionIdInUrl(sessionId) {
  const url = new URL(window.location.href);
  url.searchParams.set("session_id", sessionId);
  window.history.replaceState({}, "", url);
}
