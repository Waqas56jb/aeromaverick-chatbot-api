export function Header({ onClear, showBackToChat, onBackToChat, showHome, onGoHome }) {
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
        {showBackToChat && (
          <button className="back-home-btn" type="button" onClick={onBackToChat} title="Back to conversation">
            ← Back
          </button>
        )}
        {showHome && (
          <button className="back-home-btn back-home-btn--home" type="button" onClick={onGoHome} title="Home">
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
