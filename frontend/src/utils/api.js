import { getApiBase } from "../config.js";

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : "/" + path;
  return base ? base + p : p;
}

export async function parseErrorResponse(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (data.error && typeof data.error === "object" && data.error.message) {
      return data.error.message;
    }
    if (typeof data.error === "string") return data.error;
    if (data.message) return data.message;
  } catch {
    /* not JSON */
  }
  return text || "Server error";
}
