"use strict";

const { Pool } = require("pg");
const { normalizeBot } = require("./bots");

let pool = null;

/** Neon/Vercel may expose DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL. */
function getDatabaseUrl() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";
  return String(raw).trim().replace(/^["']|["']$/g, "");
}

function hasDatabaseConfig() {
  return Boolean(getDatabaseUrl());
}

/**
 * @returns {import('pg').Pool | null}
 */
function getPool() {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 10,
    });
  }
  return pool;
}

async function initDb() {
  const p = getPool();
  if (!p) {
    console.warn("[DB] No DATABASE_URL / POSTGRES_URL — using local Excel only for leads");
    return false;
  }
  await p.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id      TEXT NOT NULL,
      name            TEXT NOT NULL DEFAULT '',
      email           TEXT NOT NULL DEFAULT '',
      phone           TEXT NOT NULL DEFAULT '',
      intent          TEXT NOT NULL DEFAULT '',
      aircraft_type   TEXT NOT NULL DEFAULT '',
      budget          TEXT NOT NULL DEFAULT '',
      notes           TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_session_id ON leads (session_id);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
  `);
  await p.query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot TEXT NOT NULL DEFAULT 'aeromaverick';
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_leads_bot ON leads (bot);`);
  console.log("[DB] Connected — table leads ready");
  return true;
}

function filterWhere(q, botSlug, intentFilter) {
  if (botSlug == null) {
    return { sql: ` WHERE false`, params: [] };
  }
  const bot = normalizeBot(botSlug);
  const conditions = [`bot = $1`];
  const params = [bot];
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    params.push(term);
    const i = params.length;
    conditions.push(`(
      name ILIKE $${i} OR email ILIKE $${i} OR phone ILIKE $${i} OR session_id ILIKE $${i}
      OR intent ILIKE $${i} OR aircraft_type ILIKE $${i} OR notes ILIKE $${i} OR budget ILIKE $${i}
    )`);
  }
  if (intentFilter && String(intentFilter).trim()) {
    const it = `%${String(intentFilter).trim()}%`;
    params.push(it);
    conditions.push(`intent ILIKE $${params.length}`);
  }
  return { sql: ` WHERE ${conditions.join(" AND ")}`, params };
}

/**
 * @param {string} sessionId
 * @param {object} leadData — may include .bot (slug)
 */
async function insertLead(sessionId, leadData) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  const name = leadData.name ?? "";
  const email = leadData.email ?? "";
  const phone = leadData.phone ?? "";
  const intent = leadData.intent ?? "";
  const aircraft_type = leadData.aircraft_type ?? "";
  const budget = leadData.budget ?? "";
  const notes = leadData.notes ?? "";
  const bot = normalizeBot(leadData.bot);

  const { rows } = await p.query(
    `INSERT INTO leads (session_id, name, email, phone, intent, aircraft_type, budget, notes, bot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, session_id, name, email, phone, intent, aircraft_type, budget, notes, bot, created_at`,
    [sessionId, name, email, phone, intent, aircraft_type, budget, notes, bot]
  );
  return rows[0];
}

/**
 * @param {{ limit: number, offset: number, q: string, bot?: string, intent?: string }} opts
 */
async function listLeads({ limit, offset, q, bot, intent }) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  const { sql: whereSql, params: baseParams } = filterWhere(q, bot, intent);
  const n = baseParams.length;
  const lim = n + 1;
  const off = n + 2;
  const params = [...baseParams, limit, offset];
  const { rows } = await p.query(
    `SELECT id, session_id, name, email, phone, intent, aircraft_type, budget, notes, bot, created_at
     FROM leads
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${lim} OFFSET $${off}`,
    params
  );
  return rows;
}

async function countLeads(q, bot, intent) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  const { sql: whereSql, params } = filterWhere(q, bot, intent);
  const { rows } = await p.query(`SELECT COUNT(*)::int AS n FROM leads ${whereSql}`, params);
  return rows[0]?.n ?? 0;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getLeadById(leadId, botSlug) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  if (botSlug == null) return null;
  if (!UUID_RE.test(String(leadId))) return null;
  const bot = normalizeBot(botSlug);
  const { rows } = await p.query(
    `SELECT id, session_id, name, email, phone, intent, aircraft_type, budget, notes, bot, created_at
     FROM leads WHERE id = $1::uuid AND bot = $2`,
    [leadId, bot]
  );
  return rows[0] || null;
}

async function deleteLeadsByIds(rawIds, botSlug) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  if (botSlug == null) return 0;
  const bot = normalizeBot(botSlug);
  const clean = [...new Set((rawIds || []).map((x) => String(x)))].filter((id) => UUID_RE.test(id));
  if (!clean.length) return 0;
  const { rowCount } = await p.query(`DELETE FROM leads WHERE bot = $1 AND id = ANY($2::uuid[])`, [
    bot,
    clean,
  ]);
  return rowCount ?? 0;
}

/**
 * Export leads. Pass `bot` slug to filter one chatbot; omit / empty for all (e.g. legacy GET /leads).
 */
async function exportAllLeads(bot) {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL is not configured");
  if (bot === null) {
    return [];
  }
  if (bot === undefined || String(bot).trim() === "") {
    const { rows } = await p.query(
      `SELECT id, session_id, name, email, phone, intent, aircraft_type, budget, notes, bot, created_at
       FROM leads ORDER BY created_at DESC`
    );
    return rows;
  }
  const b = normalizeBot(bot);
  const { rows } = await p.query(
    `SELECT id, session_id, name, email, phone, intent, aircraft_type, budget, notes, bot, created_at
     FROM leads WHERE bot = $1 ORDER BY created_at DESC`,
    [b]
  );
  return rows;
}

module.exports = {
  getPool,
  hasDatabaseConfig,
  initDb,
  insertLead,
  listLeads,
  countLeads,
  getLeadById,
  deleteLeadsByIds,
  exportAllLeads,
};
