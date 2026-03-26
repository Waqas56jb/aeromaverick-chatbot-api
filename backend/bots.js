"use strict";

/** Allowed chatbot slugs (one DB column `bot` per lead). */
const BOT_SLUGS = [
  "safepay4u",
  "dealangler",
  "lowcostlasers",
  "medisavercard",
  "meddozer",
  "fanlabz",
  "aeromaverick",
];

const BOT_LABELS = {
  safepay4u: "Safepay4u",
  dealangler: "Dealangler",
  lowcostlasers: "Lowcostlasers",
  medisavercard: "Medisavercard",
  meddozer: "Meddozer",
  fanlabz: "Fanlabz",
  aeromaverick: "AeroMaverick",
};

const ALLOWED = new Set(BOT_SLUGS);

function normalizeBot(input) {
  const rawFb = (process.env.BOT_SLUG || "aeromaverick").toLowerCase().trim();
  const fallback = ALLOWED.has(rawFb) ? rawFb : "aeromaverick";
  if (!input || typeof input !== "string") {
    return fallback;
  }
  const s = input.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (ALLOWED.has(s)) return s;
  return fallback;
}

function botCatalog() {
  return BOT_SLUGS.map((slug) => ({ slug, label: BOT_LABELS[slug] || slug }));
}

/**
 * Chatbots listed in the admin filter dropdown.
 * - Default: all 7 slugs (each option loads only that bot’s leads).
 * - ADMIN_SINGLE_WORKSPACE=true → only this deployment’s bot (BOT_SLUG / aeromaverick).
 * - ADMIN_VISIBLE_BOTS=a,b,c → custom subset (order preserved from full catalog).
 * - ADMIN_SHOW_ALL_BOTS=true kept as no-op (same as default) for older .env files.
 */
function adminChatbotsForPanel() {
  const full = botCatalog();
  if (process.env.ADMIN_SINGLE_WORKSPACE === "true") {
    const only = normalizeBot(null);
    return full.filter((b) => b.slug === only);
  }
  const raw = (process.env.ADMIN_VISIBLE_BOTS || "").trim();
  if (raw) {
    const want = [];
    const seen = new Set();
    for (const part of raw.split(",")) {
      const s = part.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (ALLOWED.has(s) && !seen.has(s)) {
        seen.add(s);
        want.push(s);
      }
    }
    if (want.length) {
      const bySlug = new Map(full.map((b) => [b.slug, b]));
      return want.map((slug) => bySlug.get(slug)).filter(Boolean);
    }
  }
  return full;
}

/**
 * Resolve admin ?bot=.
 * - Omit or empty ?bot → {@link normalizeBot}(null) (default chatbot for this API, not “first in list”).
 * - Slug must be on {@link adminChatbotsForPanel} list, else `null` (no rows).
 */
function resolveAdminBotParam(queryBot) {
  const panel = adminChatbotsForPanel();
  const allowedPanel = new Set(panel.map((b) => b.slug));
  const requested = typeof queryBot === "string" ? queryBot.trim() : "";
  const fallback = normalizeBot(null);
  if (!requested) {
    return allowedPanel.has(fallback) ? fallback : panel[0]?.slug || fallback;
  }
  const s = requested.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!ALLOWED.has(s)) {
    return null;
  }
  if (!allowedPanel.has(s)) {
    return null;
  }
  return s;
}

module.exports = {
  BOT_SLUGS,
  normalizeBot,
  botCatalog,
  adminChatbotsForPanel,
  resolveAdminBotParam,
};
