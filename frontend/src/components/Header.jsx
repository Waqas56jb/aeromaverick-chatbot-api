export function Header({ onClear }) {
  return (
    <header>
      <div className="logo-wrap">
        <div className="logo-icon">✈</div>
        <div className="logo-text">
          <span className="brand">AEROMAVERICK</span>
          <span className="tagline">Aviation Concierge</span>
        </div>
      </div>
      <div className="header-right">
        <span className="status-dot">Online</span>
        <button className="clear-btn" type="button" onClick={onClear}>
          New Chat
        </button>
      </div>
    </header>
  );
}
