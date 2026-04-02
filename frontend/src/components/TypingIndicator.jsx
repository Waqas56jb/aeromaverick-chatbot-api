export function TypingIndicator({ visible }) {
  return (
    <div id="typing-indicator" className={visible ? "visible" : undefined}>
      <div className="typing-avatar">✈</div>
      <div className="typing-bubble">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  );
}
