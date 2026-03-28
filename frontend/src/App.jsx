import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const api = (path) => `${API_BASE}${path}`;
const CHAT_BOT = (import.meta.env.VITE_BOT_SLUG || "aeromaverick").trim();

/** Instant first paint — must match server default in `getChatWelcomeMessage()` when env unset. Override with VITE_CHAT_WELCOME_MESSAGE to match server CHAT_WELCOME_MESSAGE. */
const SERVER_DEFAULT_WELCOME =
  "Hi 👋 Welcome to AeroMaverick. How can I help you today — are you looking to buy, sell, or finance an aircraft?";

function buildProvisionalWelcome() {
  const fromEnv = (import.meta.env.VITE_CHAT_WELCOME_MESSAGE || "").trim();
  const content = fromEnv || SERVER_DEFAULT_WELCOME;
  return [{ role: "assistant", content, ts: Date.now() }];
}

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

/** Renders **bold** and bullet / numbered lists so assistant replies are scannable (matches backend FORMATTING rules). */
function inlineFormat(str) {
  const parts = String(str).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    const m = part.match(/^\*\*(.+)\*\*$/);
    if (m) return <strong key={idx}>{m[1]}</strong>;
    return <span key={idx}>{part}</span>;
  });
}

function AssistantMessageBody({ text }) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  const blocks = [];
  let i = 0;

  const flushList = (items, ordered) => {
    if (!items.length) return;
    const Tag = ordered ? "ol" : "ul";
    const cls = ordered ? "msg-ol" : "msg-ul";
    blocks.push(
      <Tag key={`list-${blocks.length}`} className={cls}>
        {items.map((item, j) => (
          <li key={j} className="msg-li">
            {inlineFormat(item)}
          </li>
        ))}
      </Tag>
    );
  };

  let listItems = [];
  let ordered = false;
  const isBullet = (s) => /^[-*•]\s/.test(s);
  const isNumbered = (s) => /^\d+\.\s/.test(s);

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (listItems.length) {
        flushList(listItems, ordered);
        listItems = [];
        ordered = false;
      }
      i++;
      continue;
    }
    if (isBullet(trimmed)) {
      if (listItems.length && ordered) {
        flushList(listItems, true);
        listItems = [];
        ordered = false;
      }
      listItems.push(trimmed.replace(/^[-*•]\s+/, ""));
      i++;
      continue;
    }
    if (isNumbered(trimmed)) {
      if (listItems.length && !ordered) {
        flushList(listItems, false);
        listItems = [];
      }
      ordered = true;
      listItems.push(trimmed.replace(/^\d+\.\s+/, ""));
      i++;
      continue;
    }
    if (listItems.length) {
      flushList(listItems, ordered);
      listItems = [];
      ordered = false;
    }
    const paraLines = [trimmed];
    i++;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || isBullet(t) || isNumbered(t)) break;
      paraLines.push(t);
      i++;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="msg-para">
        {inlineFormat(paraLines.join(" "))}
      </p>
    );
  }
  if (listItems.length) flushList(listItems, ordered);

  if (blocks.length === 0) {
    return <p className="msg-text msg-text--fallback">{raw || " "}</p>;
  }

  return <div className="msg-rich">{blocks}</div>;
}

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState(buildProvisionalWelcome);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState(null);
  const [error, setError] = useState(null);
  const listEndRef = useRef(null);

  const scrollToBottom = () => listEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const startChatSession = useCallback(async () => {
    setBootError(null);
    setError(null);
    setBootLoading(true);
    try {
      const res = await fetch(api("/chat/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot: CHAT_BOT }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Could not start chat (${res.status})`);
      }
      const sid = data.session_id || data.sessionId;
      if (!sid) throw new Error("Invalid session response from server.");
      setSessionId(sid);
      const now = Date.now();
      const initial = Array.isArray(data.messages)
        ? data.messages.map((m, i) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: String(m.content ?? ""),
            ts: now + i,
          }))
        : [];
      setMessages(initial);
    } catch (e) {
      setBootError(e.message || "Network error");
      setSessionId(null);
      /* Keep provisional welcome visible — never flash an empty thread. */
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    startChatSession();
  }, [startChatSession]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || bootLoading || !sessionId) return;

    const now = Date.now();
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text, ts: now }]);
    setLoading(true);

    try {
      const body = { message: text, bot: CHAT_BOT, session_id: sessionId };

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
  }, [input, loading, sessionId, bootLoading]);

  const newChat = () => {
    setInput("");
    setError(null);
    setBootError(null);
    setMessages(buildProvisionalWelcome());
    setSessionId(null);
    startChatSession();
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
          <button
            type="button"
            className="chat-top-new"
            onClick={newChat}
            disabled={bootLoading}
          >
            New chat
          </button>
        </header>

        {bootError && (
          <div className="chat-alert" role="alert">
            {bootError}{" "}
            <button type="button" className="chat-alert-retry" onClick={startChatSession}>
              Retry
            </button>
          </div>
        )}
        {error && (
          <div className="chat-alert" role="alert">
            {error}
          </div>
        )}

        <main className="chat-body">
          <ul className="chat-stream" aria-live="polite">
            {messages.map((msg, i) =>
              msg.role === "assistant" ? (
                <li key={`${msg.ts}-${i}`} className="msg msg--bot">
                  <div className="msg-side">
                    <div className="msg-avatar msg-avatar--bot">
                      <img src={BOT_AVATAR_URL} alt="" width={40} height={40} />
                    </div>
                    <time className="msg-time" dateTime={msg.ts ? new Date(msg.ts).toISOString() : undefined}>
                      {formatMsgTime(msg.ts)}
                    </time>
                  </div>
                  <div
                    className={`msg-bubble msg-bubble--bot${bootLoading && !sessionId && i === 0 ? " msg-bubble--bootstrapping" : ""}`}
                  >
                    <AssistantMessageBody text={msg.content} />
                  </div>
                </li>
              ) : (
                <li key={`${msg.ts}-${i}`} className="msg msg--user">
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
              disabled={loading || bootLoading || !sessionId}
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
            disabled={loading || bootLoading || !sessionId || !input.trim()}
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
