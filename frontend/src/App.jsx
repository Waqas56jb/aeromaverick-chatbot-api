import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const api = (path) => `${API_BASE}${path}`;
const CHAT_BOT = (import.meta.env.VITE_BOT_SLUG || "aeromaverick").trim();

const TEAM_NAME = "AeroMaverick Team";

/** Dummy chatbot avatar — airplane (Twemoji PNG via jsDelivr). */
const BOT_AVATAR_URL =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2708.png";

/** Dummy seeker avatar (generic portrait-style placeholder). */
const USER_AVATAR_URL =
  "https://ui-avatars.com/api/?name=You&size=128&background=334155&color=e2e8f0&bold=true";

function formatMsgTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const listEndRef = useRef(null);

  const scrollToBottom = () => listEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const now = Date.now();
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text, ts: now }]);
    setLoading(true);

    try {
      const body = { message: text, bot: CHAT_BOT };
      if (sessionId) body.session_id = sessionId;

      const res = await fetch(api("/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "Sorry — I couldn’t reply just now. Please try again in a moment.",
            ts: Date.now(),
          },
        ]);
        return;
      }

      setSessionId(data.session_id);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply || "", ts: Date.now() },
      ]);
    } catch (e) {
      setError(e.message || "Network error");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Sorry — something went wrong. Check your connection and try again.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId]);

  const newChat = () => {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setInput("");
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-shell">
        <header className="chat-top">
          <div className="chat-top-brand">
            <img src={BOT_AVATAR_URL} alt="" className="chat-top-logo" width={36} height={36} />
            <div className="chat-top-text">
              <h1 className="chat-top-title">{TEAM_NAME}</h1>
              <p className="chat-top-sub">We typically reply right away</p>
            </div>
          </div>
          <button type="button" className="chat-top-new" onClick={newChat}>
            New chat
          </button>
        </header>

        {error && (
          <div className="chat-alert" role="alert">
            {error}
          </div>
        )}

        <main className="chat-body">
          <ul className="chat-stream" aria-live="polite">
            {messages.length === 0 && (
              <li className="chat-empty">
                <div className="chat-empty-avatar">
                  <img src={BOT_AVATAR_URL} alt="" width={56} height={56} />
                </div>
                <p className="chat-empty-title">Start a conversation</p>
                <p className="chat-empty-text">
                  Ask about charter, aircraft sales, financing, or anything AeroMaverick can help with.
                </p>
              </li>
            )}
            {messages.map((msg, i) =>
              msg.role === "assistant" ? (
                <li key={i} className="msg msg--bot">
                  <div className="msg-side">
                    <div className="msg-avatar msg-avatar--bot">
                      <img src={BOT_AVATAR_URL} alt="" width={40} height={40} />
                    </div>
                    <time className="msg-time" dateTime={msg.ts ? new Date(msg.ts).toISOString() : undefined}>
                      {formatMsgTime(msg.ts)}
                    </time>
                  </div>
                  <div className="msg-bubble msg-bubble--bot">
                    <p className="msg-text">{msg.content}</p>
                  </div>
                </li>
              ) : (
                <li key={i} className="msg msg--user">
                  <div className="msg-bubble msg-bubble--user">
                    <p className="msg-text">{msg.content}</p>
                    <time className="msg-time msg-time--inline">{formatMsgTime(msg.ts)}</time>
                  </div>
                  <div className="msg-side msg-side--user">
                    <div className="msg-avatar msg-avatar--user">
                      <img src={USER_AVATAR_URL} alt="" width={40} height={40} />
                    </div>
                  </div>
                </li>
              )
            )}
            {loading && (
              <li className="msg msg--bot" aria-hidden>
                <div className="msg-side">
                  <div className="msg-avatar msg-avatar--bot">
                    <img src={BOT_AVATAR_URL} alt="" width={40} height={40} />
                  </div>
                  <time className="msg-time">{formatMsgTime(Date.now())}</time>
                </div>
                <div className="msg-bubble msg-bubble--bot msg-bubble--typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </li>
            )}
            <li ref={listEndRef} className="chat-anchor" aria-hidden />
          </ul>
        </main>

        <footer className="chat-bar">
          <div className="chat-pill">
            <span className="chat-pill-icon" aria-hidden>
              🙂
            </span>
            <textarea
              className="chat-pill-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message"
              rows={1}
              disabled={loading}
              aria-label="Type a message"
            />
            <span className="chat-pill-icon chat-pill-icon--muted" aria-hidden>
              📎
            </span>
          </div>
          <button
            type="button"
            className="chat-fab"
            onClick={send}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </footer>
      </div>
    </div>
  );
}

export default App;
