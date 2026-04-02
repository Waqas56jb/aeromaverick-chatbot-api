export function WelcomePanel() {
  return (
    <div id="welcome">
      <div className="welcome-plane">✈️</div>
      <h1>WELCOME ABOARD</h1>
      <p>
        Your dedicated aviation concierge is ready to help you buy, sell, finance, charter aircraft, or find
        specialized aviation services — all through AeroMaverick.
      </p>
      <div className="welcome-badges">
        {["Buy Aircraft", "Sell Aircraft", "Get Financing", "Charter Flights", "Aircraft Auctions", "Engine Stand Rentals"].map(
          (b) => (
            <span key={b} className="badge">
              {b}
            </span>
          )
        )}
      </div>
    </div>
  );
}
