export function Header({ onClear, showBack, onBack }) {
  return (
    <header>
      <div className="logo-wrap">
        <div className="logo-icon logo-icon--branded">
          <img src="/logo.png" alt="" className="logo-img" width={40} height={40} decoding="async" />
        </div>
        <div className="logo-text">
          <span className="brand">AEROMAVERICK</span>
          <span className="tagline">Aviation Concierge</span>
        </div>
      </div>
      <div className="header-right">
        {showBack && (
          <button className="back-home-btn" type="button" onClick={onBack} title="Back to Home">
            ← Home
          </button>
        )}
        <span className="status-dot">Online</span>
        <button className="clear-btn" type="button" onClick={onClear}>
          New Chat
        </button>
      </div>
    </header>
  );
}
