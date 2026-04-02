import { useEffect, useRef } from "react";
import { SendIcon } from "./SendIcon.jsx";

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
          <SendIcon />
        </button>
      </div>
      <p className="input-hint">
        <span>AeroMaverick AI</span> — aviation-native intelligence. Powered by GPT-4o · aeromaverick.com
      </p>
    </div>
  );
}
