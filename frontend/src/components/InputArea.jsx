import { useEffect, useRef } from "react";

export function InputArea({ value, onChange, onSend, disabled, inputRef: externalRef }) {
  const innerRef = useRef(null);
  const inputRef = externalRef || innerRef;

  useEffect(() => {
    if (value === "" && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [value, inputRef]);

  return (
    <div id="input-area">
      <div className="input-row">
        <textarea
          ref={inputRef}
          id="user-input"
          placeholder="Ask me about aircraft, financing, charters, engine stands..."
          rows={1}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onInput={(e) => {
            const t = e.target;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button id="send-btn" type="button" title="Send" disabled={disabled} onClick={onSend}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#09111f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <p className="input-hint">
        <span>AeroMaverick AI</span> — aviation-native intelligence. Powered by GPT-4o · aeromaverick.com
      </p>
    </div>
  );
}
