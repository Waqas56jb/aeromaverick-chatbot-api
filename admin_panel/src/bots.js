/** Mirror backend/bots.js — labels for UI. Slugs must match server. */
export const DEFAULT_BOT_SLUG = "aeromaverick";

export const CHATBOTS = [
  { slug: "safepay4u", label: "Safepay4u", short: "SP" },
  { slug: "dealangler", label: "Dealangler", short: "DA" },
  { slug: "lowcostlasers", label: "Lowcostlasers", short: "LC" },
  { slug: "medisavercard", label: "Medisavercard", short: "MS" },
  { slug: "meddozer", label: "Meddozer", short: "MZ" },
  { slug: "fanlabz", label: "Fanlabz", short: "FB" },
  { slug: "aeromaverick", label: "AeroMaverick", short: "AM" },
];

export const ADMIN_BOT_KEY = "aeromaverick_admin_bot";

export function labelForSlug(slug) {
  return CHATBOTS.find((b) => b.slug === slug)?.label || slug;
}
