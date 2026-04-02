import { formatMessage } from "../utils/formatMessage.js";

export function MessageBubble({ role, text, time }) {
  const avatarEmoji = role === "bot" ? "✈" : "👤";
  const label = role === "bot" ? "AeroMaverick AI" : "You";

  return (
    <div className={`msg ${role}`}>
      <div className="avatar">{avatarEmoji}</div>
      <div className="bubble-wrap">
        <span className="sender-label">{label}</span>
        <div className="bubble" dangerouslySetInnerHTML={{ __html: formatMessage(text) }} />
        <span className="msg-time">{time}</span>
      </div>
    </div>
  );
}
