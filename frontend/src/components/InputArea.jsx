import { useEffect, useRef, useState } from "react";
import { VoiceAgent } from "./VoiceAgent";

export function InputArea({ value, onChange, onSend, disabled, inputRef: externalRef, onVoiceTranscript }) {
  const innerRef = useRef(null);
  const inputRef = externalRef || innerRef;
  const [voiceActive, setVoiceActive] = useState(false);

  const openVoice = () => setVoiceActive(true);
  const closeVoice = () => setVoiceActive(false);

  useEffect(() => {
    if (value === "" && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [value, inputRef]);

  /* lock body scroll when overlay is open */
  useEffect(() => {
    if (voiceActive) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [voiceActive]);

  return (
    <>
      {voiceActive && (
        <VoiceAgent onClose={(transcript) => {
          closeVoice();
          if (onVoiceTranscript && transcript && transcript.length > 0) onVoiceTranscript(transcript);
        }} />
      )}

      <div id="input-area">
        <p className="input-assistant-tagline" role="status">
          Ask Anything – Your AI Assistant
        </p>
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
          <button
            type="button"
            className={`voice-btn${voiceActive ? " voice-btn--active" : ""}`}
            onClick={openVoice}
            title="Start voice input"
            aria-label="Start voice input"
          >
            <svg className="voice-btn__icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="9" y1="22" x2="15" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button id="send-btn" type="button" title="Send" disabled={disabled} onClick={onSend}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="input-hint">
          <span>AeroMaverick AI</span> — aviation-native intelligence. Powered by GPT-4o · aeromaverick.com
        </p>
      </div>
    </>
  );
}
