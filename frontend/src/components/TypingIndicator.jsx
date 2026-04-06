export function TypingIndicator({ visible }) {
  return (
    <div id="typing-indicator" className={visible ? "visible" : undefined}>
      <div className="typing-avatar">
        <img src="/logo.png" alt="" className="typing-avatar-logo" width={22} height={22} decoding="async" />
      </div>
      <div className="typing-bubble">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  );
}
