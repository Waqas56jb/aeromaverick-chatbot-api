import { useEffect } from "react";

export function ErrorToast({ message, onHide }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onHide(), 5000);
    return () => clearTimeout(t);
  }, [message, onHide]);

  return (
    <div id="error-toast" style={{ display: message ? "block" : "none" }}>
      {message ? message : ""}
    </div>
  );
}
