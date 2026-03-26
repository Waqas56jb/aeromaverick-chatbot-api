import logoPng from "../assets/logo.png";

/** Local logo by default; optional absolute URL via VITE_BRAND_LOGO_URL. */
export const BRAND_LOGO_URL =
  (import.meta.env.VITE_BRAND_LOGO_URL && String(import.meta.env.VITE_BRAND_LOGO_URL).trim()) || logoPng;
