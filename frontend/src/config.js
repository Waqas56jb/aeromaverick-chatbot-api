/** Same as meta chatbot-api-base: API origin, no trailing slash. Set via .env VITE_CHATBOT_API_BASE */
export function getApiBase() {
  return (import.meta.env.VITE_CHATBOT_API_BASE || "").trim().replace(/\/$/, "");
}
