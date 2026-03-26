/**
 * API calls use same-origin paths by default (Vite proxies /admin and /config to the backend in dev;
 * production should serve this UI from the same host as the API, e.g. /panel/).
 * Optional: set VITE_API_BASE in admin_panel env when the API lives on another origin.
 */
export function getAdminKey() {
  const k = import.meta.env.VITE_ADMIN_API_KEY;
  return k?.trim() || "";
}

export function getApiBase() {
  const env = import.meta.env.VITE_API_BASE;
  if (env != null && String(env).trim() !== "") {
    return String(env).replace(/\/$/, "");
  }
  return "";
}

export async function loadBackendConfig() {
  const candidates = ["/config"];
  if (import.meta.env.DEV) {
    candidates.push("http://localhost:3000/config");
  }
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function apiPath(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${p}` : p;
}

export async function fetchWithKey(path, apiKey, options = {}) {
  const headers = new Headers(options.headers || {});
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
  const res = await fetch(apiPath(path), { ...options, headers });
  return res;
}

export async function fetchAdmin(path, options = {}) {
  return fetchWithKey(path, getAdminKey(), options);
}

export async function downloadWithKey(path, filename, apiKey) {
  const res = await fetchWithKey(path, apiKey);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAdmin(path, filename) {
  return downloadWithKey(path, filename, getAdminKey());
}
