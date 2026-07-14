# TMC Policy Assistant — React frontend

A React + Vite rebuild of the original Streamlit `app.py`. Same features, same TMC navy/green
brand, talking to the same FastAPI backend — just a faster, more polished client.

## Features (parity with the Streamlit app)

- **Streaming answers** — tokens render live as the backend streams `/ask/stream` (SSE-style `data:` lines).
- **Session persistence** — the conversation id lives in `?session_id=` in the URL, so refreshing keeps
  your chat and a fresh tab starts a new one.
- **Sidebar conversation history** — list, switch between, and delete past conversations (`⋮` menu).
- **Backend status indicator** — green / amber / red dot reflecting `/health`.
- **Edit & resend** — edit any of your previous messages; resending drops everything after it and
  regenerates the answer.
- **Citations** — expandable "📎 Sources" panel per answer, showing source, page, and snippet.
- **Welcome screen** with clickable example questions when a conversation is empty.
- **Graceful errors** — unreachable backend / timeout / mid-stream errors are shown inline, matching
  the original's messaging.

## Getting started

```bash
npm install
cp .env.example .env   # then edit VITE_BACKEND_URL if your backend isn't on localhost:8000
npm run dev
```

Open the printed local URL. The FastAPI backend (`uvicorn main:app`) must be running separately —
this app is a pure frontend and does not embed any backend logic, same as the original Streamlit UI.

## Build

```bash
npm run build   # outputs static files to dist/
npm run preview # serve the production build locally
```

## Backend API contract

This frontend expects the same FastAPI backend as the Streamlit app:

| Method | Path                    | Purpose                                                |
|--------|--------------------------|---------------------------------------------------------|
| GET    | `/health`                | `{ vectorstore_ready: boolean }`                         |
| GET    | `/sessions`               | `{ sessions: [{ session_id, title }] }`                  |
| GET    | `/history/{session_id}`   | `{ messages: [{ role, content }] }`                       |
| DELETE | `/history/{session_id}`   | Deletes a conversation                                    |
| POST   | `/ask/stream`             | Body: `{ question, session_id }`. Streams `data: {...}\n` lines with `type` of `token`, `citations`, `error`, or `done`. |

## Project structure

```
src/
  App.jsx                 top-level state: sessions, messages, streaming
  components/
    Sidebar.jsx            status dot, new conversation, session list, KB list, session id
    Header.jsx              brand header + mobile menu button
    WelcomeScreen.jsx       empty-state with example prompts
    ChatMessage.jsx         a single bubble, including inline edit mode
    ChatInput.jsx           autosizing textarea + send button
    Citations.jsx           collapsible source list
  lib/
    api.js                  all backend calls (health, sessions, history, streaming ask)
    session.js              session id <-> URL query param helpers
    markdown.js              tiny, dependency-free markdown renderer for answer text
  styles/
    index.css               resets, fonts, scrollbars, focus states
    App.css                 layout + component styling (TMC navy/green theme)
public/
  logo.png                 TMC logo, extracted from the original app's embedded base64
```

## Notes

- No UI framework dependency was added beyond React itself — markdown rendering, streaming parsing,
  and layout are all hand-rolled to keep the bundle small and the behavior transparent.
- The color system, gradients, and card treatments mirror the original Streamlit CSS (`TMC_GREEN`,
  `TMC_NAVY`, etc.) but with refined spacing, motion (message-in animation, hover states, blinking
  stream cursor), and a responsive layout with a collapsible sidebar on mobile.
