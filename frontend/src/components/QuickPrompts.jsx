import { QUICK_PROMPTS } from "../config/quickPrompts.js";

export function QuickPrompts({ onQuick, disabled }) {
  return (
    <div id="quick-prompts">
      {QUICK_PROMPTS.map((q) => (
        <button
          key={q.label}
          type="button"
          className="qp-btn"
          disabled={disabled}
          onClick={() => onQuick(q.text)}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
