const WELCOME_TOPICS = [
  {
    label: "Buy Aircraft",
    prompt:
      "I want to buy an aircraft through AeroMaverick. What listings, acquisition support, and next steps do you offer?",
  },
  {
    label: "Sell Aircraft",
    prompt:
      "I want to sell my aircraft. How does AeroMaverick handle marketing, listings, and the sales process?",
  },
  {
    label: "Get Financing",
    prompt: "What aircraft financing and lending options does AeroMaverick offer, and how do I get started?",
  },
  {
    label: "Charter Flights",
    prompt: "Tell me about private charter flights and how AeroMaverick can help arrange or broker travel.",
  },
  {
    label: "Aircraft Auctions",
    prompt: "How do aircraft auctions work with AeroMaverick, and how can I participate or consign?",
  },
  {
    label: "Engine Stand Rentals",
    prompt: "I need engine stand rentals. What inventory and rental terms does AeroMaverick provide?",
  },
];

export function WelcomePanel({ onSelectTopic, disabled }) {
  return (
    <div id="welcome">
      <div className="welcome-plane">
        <img src="/logo.png" alt="" className="welcome-logo" width={120} height={120} decoding="async" />
      </div>
      <h1>WELCOME ABOARD</h1>
      <p>
        Your dedicated aviation concierge is ready to help you buy, sell, finance, charter aircraft, or find
        specialized aviation services — all through AeroMaverick.
      </p>
      <div className="welcome-badges" role="group" aria-label="Quick topics">
        {WELCOME_TOPICS.map(({ label, prompt }) => (
          <button
            key={label}
            type="button"
            className="badge welcome-topic-btn"
            disabled={disabled}
            onClick={() => onSelectTopic?.(prompt)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
