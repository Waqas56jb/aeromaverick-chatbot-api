import { formatMessage } from "../utils/formatMessage.js";

export function MessageBubble({ role, text, time }) {
  const label = role === "bot" ? "AeroMaverick AI" : "You";

  return (
    <div className={`msg ${role}`}>
      <div className="avatar">
        {role === "bot" ? (
          <img src="/logo.png" alt="" className="avatar-logo" width={28} height={28} decoding="async" />
        ) : (
          <span className="user-avatar-initial" aria-hidden>
            U
          </span>
        )}
      </div>
      <div className="bubble-wrap">
        <span className="sender-label">{label}</span>
        <div className="bubble" dangerouslySetInnerHTML={{ __html: formatMessage(text) }} />
        <span className="msg-time">{time}</span>
      </div>
    </div>
  );
}
