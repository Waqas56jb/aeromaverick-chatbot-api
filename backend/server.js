/**
 * ============================================================
 *  AeroMaverick AI Chatbot — Backend Server
 *  server.js
 *
 *  Stack : Node.js + Express + OpenAI + ExcelJS
 *  Leads : Postgres (DATABASE_URL) + Excel fallback
 *
 *  MEMORY STRATEGY — Sliding Window (last 20 messages)
 *  ─────────────────────────────────────────────────────
 *  Full conversation is stored in session.messages (in RAM).
 *  Before each OpenAI call, only the last MEMORY_WINDOW
 *  messages are sent — this prevents:
 *    - Token overflow on long conversations
 *    - Model hallucination from stale context
 *    - Unnecessary API cost
 *  The first user message is always included (anchor context).
 *  System prompt is always prepended (not counted in window).
 *
 *  Routes:
 *    POST /chat/session  — create session + welcome message (backend-controlled)
 *    GET  /chat/init     — same via GET (?bot=)
 *    POST /chat          — main chat endpoint
 *    GET  /leads         — download leads Excel
 *    GET  /health        — health check
 *    GET  /config        — public config for admin panel
 *    GET/POST /admin/*   — admin routes (ADMIN_API_KEY)
 * ============================================================
 *
 *  SETUP
 *  -----
 *  npm install express openai exceljs dotenv cors
 *
 *  .env file:
 *    OPENAI_API_KEY=sk-...
 *    PORT=3000
 *    LEADS_FILE=leads.xlsx
 *    DATABASE_URL=postgresql://...
 *    ADMIN_API_KEY=your-secret-key
 *    SAVE_LEADS_TO_EXCEL=true
 *    PUBLIC_API_URL=https://...
 *    CHAT_WELCOME_MESSAGE=...   (optional override)
 *    CHAT_TEMPERATURE=0.45      (0.0–1.0, default 0.45)
 *    MEMORY_WINDOW=20           (messages per window, default 20)
 *
 *  POST /chat/session  →  { session_id, sessionId, bot, messages }
 *  POST /chat          →  { session_id, bot, reply, lead_saved, lead_data }
 * ============================================================
 */

"use strict";

const path = require("path");
const os   = require("os");

// ─── Load .env (local dev only) ──────────────────────────────
if (!process.env.VERCEL) {
  const envPath = path.join(__dirname, ".env");
  if (require("fs").existsSync(envPath)) {
    require("dotenv").config({ path: envPath, override: true });
  }
}

const express        = require("express");
const cors           = require("cors");
const OpenAI         = require("openai");
const { randomUUID } = require("crypto");
const fs             = require("fs");
const db             = require("./db");
const {
  normalizeBot,
  adminChatbotsForPanel,
  resolveAdminBotParam,
} = require("./bots");

// ─── Config ──────────────────────────────────────────────────
if (process.env.VERCEL && !(process.env.LEADS_FILE || "").trim()) {
  process.env.LEADS_FILE = path.join(os.tmpdir(), "aeromaverick-leads.xlsx");
}

const PORT       = process.env.PORT       || 3000;
const LEADS_FILE = process.env.LEADS_FILE || path.join(__dirname, "leads.xlsx");
const IS_VERCEL  = Boolean(process.env.VERCEL);
const MODEL      = "gpt-4o";
const MAX_TOKENS = 850;

const _t = Number(process.env.CHAT_TEMPERATURE);
const CHAT_TEMPERATURE = Number.isFinite(_t) ? _t : 0.45;

const _mw = Number(process.env.MEMORY_WINDOW);
const MEMORY_WINDOW = Number.isFinite(_mw) && _mw > 0 ? Math.floor(_mw) : 20;

// ─── OpenAI client ───────────────────────────────────────────
const openai = new OpenAI({ apiKey: (process.env.OPENAI_API_KEY || "").trim() });

// ─── Session store ───────────────────────────────────────────
const sessions       = {};
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// ─── Express ─────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────
//  WELCOME MESSAGE — always comes from backend, never frontend
// ─────────────────────────────────────────────────────────────
function getChatWelcomeMessage() {
  const custom = (process.env.CHAT_WELCOME_MESSAGE || "").trim();
  if (custom) return custom;
  return "Hi 👋 Welcome to AeroMaverick. How can I help you today — are you looking to buy, sell, or finance an aircraft?";
}

// ─────────────────────────────────────────────────────────────
//  SYSTEM PROMPT
//  Knowledge base lives in ./prompts/aeromaverickSystemPrompt.js
//  Lead JSON protocol is appended here in server.js
// ─────────────────────────────────────────────────────────────
const AERO_KB_PROMPT = require("./prompts/aeromaverickSystemPrompt.js");

const LEAD_JSON_PROTOCOL = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEAD CAPTURE — JSON PROTOCOL (SERVER INSTRUCTION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After providing real value, ask ONCE for name + email (phone optional).
Never bundle the contact request with another question.

When you have collected name + email, output this ONCE at the END of your reply:

<<<LEAD_DATA>>>
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "intent": "buy|sell|finance|charter|engine_stand|auction|general",
  "aircraft_type": "...",
  "budget": "...",
  "notes": "..."
}
<<<END_LEAD>>>

Use "" for unknown fields. Never output this block more than once per conversation.
After it, confirm: "I've captured your details — our team will be in touch shortly."
`.trim();

const SYSTEM_PROMPT = `${AERO_KB_PROMPT}\n\n${LEAD_JSON_PROTOCOL}`;

// ─────────────────────────────────────────────────────────────
//  SLIDING WINDOW MEMORY
//
//  buildOpenAIMessages(allMessages):
//    1. Always includes system prompt
//    2. Always includes first user message (original intent anchor)
//    3. Includes last MEMORY_WINDOW messages from full history
//    4. Deduplicates if first message falls within window
//
//  Why this approach:
//    - Prevents token overflow on very long chats
//    - Keeps bot aware of original user intent
//    - Avoids hallucination from too much stale context
//    - Full history preserved in session.messages for audit
// ─────────────────────────────────────────────────────────────
function buildOpenAIMessages(allMessages) {
  const systemMsg = { role: "system", content: SYSTEM_PROMPT };

  if (allMessages.length === 0) {
    return [systemMsg];
  }

  // Find first actual user message (original intent anchor)
  const firstUserMsg = allMessages.find((m) => m.role === "user") || null;

  // Slice the last MEMORY_WINDOW messages
  const windowStart = Math.max(0, allMessages.length - MEMORY_WINDOW);
  let windowMsgs    = allMessages.slice(windowStart);

  // Prepend first user message if it's not already in the window
  if (firstUserMsg && windowStart > 0) {
    const alreadyInWindow = windowMsgs.some(
      (m) => m.role === "user" && m.content === firstUserMsg.content
    );
    if (!alreadyInWindow) {
      windowMsgs = [firstUserMsg, ...windowMsgs];
    }
  }

  return [systemMsg, ...windowMsgs];
}

// ─────────────────────────────────────────────────────────────
//  LEAD PARSER
// ─────────────────────────────────────────────────────────────
function extractLeadFromReply(rawReply) {
  const startTag = "<<<LEAD_DATA>>>";
  const endTag   = "<<<END_LEAD>>>";

  const start = rawReply.indexOf(startTag);
  const end   = rawReply.indexOf(endTag);

  if (start === -1 || end === -1) {
    return { leadData: null, cleanReply: rawReply.trim() };
  }

  const jsonStr    = rawReply.substring(start + startTag.length, end).trim();
  const before     = rawReply.substring(0, start).trim();
  const after      = rawReply.substring(end + endTag.length).trim();
  const cleanReply = [before, after].filter(Boolean).join("\n\n");

  try {
    return { leadData: JSON.parse(jsonStr), cleanReply };
  } catch (e) {
    console.error("[Lead Parser] JSON parse error:", e.message);
    return { leadData: null, cleanReply: rawReply.trim() };
  }
}

// ─────────────────────────────────────────────────────────────
//  EXCEL HELPERS
// ─────────────────────────────────────────────────────────────
function requireExcelJS() { return require("exceljs"); }

function csvEscape(val) {
  const t = val == null ? "" : String(val);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

async function workbookFromLeadRows(rows) {
  const ExcelJS = requireExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.columns = [
    { header: "Timestamp",    key: "timestamp",     width: 22 },
    { header: "Chatbot",      key: "bot",           width: 16 },
    { header: "Session ID",   key: "session_id",    width: 28 },
    { header: "Name",         key: "name",          width: 20 },
    { header: "Email",        key: "email",         width: 28 },
    { header: "Phone",        key: "phone",         width: 18 },
    { header: "Intent",       key: "intent",        width: 16 },
    { header: "Aircraft Type",key: "aircraft_type", width: 20 },
    { header: "Budget",       key: "budget",        width: 16 },
    { header: "Notes",        key: "notes",         width: 40 },
  ];
  for (const r of rows) {
    const ts = r.created_at
      ? new Date(r.created_at).toISOString().replace("T", " ").substring(0, 19)
      : "";
    ws.addRow({
      timestamp:     ts,
      bot:           r.bot           || "",
      session_id:    r.session_id    || "",
      name:          r.name          || "",
      email:         r.email         || "",
      phone:         r.phone         || "",
      intent:        r.intent        || "",
      aircraft_type: r.aircraft_type || "",
      budget:        r.budget        || "",
      notes:         r.notes         || "",
    });
  }
  ws.getRow(1).eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A6B" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border    = { bottom: { style: "medium", color: { argb: "FF1B3A6B" } } };
  });
  ws.getRow(1).height = 20;
  return wb;
}

async function ensureLeadsFile() {
  if (fs.existsSync(LEADS_FILE)) return;
  const ExcelJS = requireExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.columns = [
    { header: "Timestamp",    key: "timestamp",    width: 22 },
    { header: "Session ID",   key: "session_id",   width: 28 },
    { header: "Name",         key: "name",         width: 20 },
    { header: "Email",        key: "email",         width: 28 },
    { header: "Phone",        key: "phone",         width: 18 },
    { header: "Intent",       key: "intent",        width: 16 },
    { header: "Aircraft Type",key: "aircraft_type", width: 20 },
    { header: "Budget",       key: "budget",        width: 16 },
    { header: "Notes",        key: "notes",         width: 40 },
  ];
  ws.getRow(1).eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A6B" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border    = { bottom: { style: "medium", color: { argb: "FF1B3A6B" } } };
  });
  ws.getRow(1).height = 20;
  await wb.xlsx.writeFile(LEADS_FILE);
  console.log(`[Excel] Created: ${LEADS_FILE}`);
}

async function saveLeadToExcelFile(sessionId, leadData) {
  await ensureLeadsFile();
  const ExcelJS = requireExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(LEADS_FILE);
  const ws = wb.getWorksheet("Leads");
  ws.addRow({
    timestamp:     new Date().toISOString().replace("T", " ").substring(0, 19),
    session_id:    sessionId,
    name:          leadData.name          || "",
    email:         leadData.email         || "",
    phone:         leadData.phone         || "",
    intent:        leadData.intent        || "",
    aircraft_type: leadData.aircraft_type || "",
    budget:        leadData.budget        || "",
    notes:         leadData.notes         || "",
  });
  await wb.xlsx.writeFile(LEADS_FILE);
  console.log(`[Lead] Excel → ${leadData.name} | ${leadData.email} | ${leadData.intent}`);
}

async function saveLead(sessionId, leadData) {
  let persisted = false;
  const pool    = db.getPool();
  const sess    = sessions[sessionId];
  const bot     = sess?.bot || normalizeBot(null);
  const payload = { ...leadData, bot };

  if (pool) {
    try {
      await db.insertLead(sessionId, payload);
      persisted = true;
      console.log(`[Lead] DB → ${leadData.name} | ${leadData.email} | ${leadData.intent}`);
    } catch (e) {
      console.error("[Lead] DB error:", e.message);
    }
  }

  if (process.env.SAVE_LEADS_TO_EXCEL === "true" || !pool || !persisted) {
    try {
      await saveLeadToExcelFile(sessionId, payload);
      persisted = true;
    } catch (e) {
      console.error("[Lead] Excel error:", e.message);
    }
  }

  return persisted;
}

// ─────────────────────────────────────────────────────────────
//  SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────
function getSession(sessionId, botFromRequest) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      messages:     [],
      lead:         {},
      leadSaved:    false,
      createdAt:    Date.now(),
      lastActivity: Date.now(),
      bot:          normalizeBot(botFromRequest),
    };
  }
  sessions[sessionId].lastActivity = Date.now();
  return sessions[sessionId];
}

function createChatSession(botFromRequest) {
  const sessionId = randomUUID();
  const bot       = normalizeBot(botFromRequest);
  const welcome   = getChatWelcomeMessage();
  sessions[sessionId] = {
    messages:     [{ role: "assistant", content: welcome }],
    lead:         {},
    leadSaved:    false,
    createdAt:    Date.now(),
    lastActivity: Date.now(),
    bot,
  };
  console.log(`[Session] Created: ${sessionId} | bot: ${bot}`);
  return { sessionId, bot, messages: [{ role: "assistant", content: welcome }] };
}

function cleanupSessions() {
  const now = Date.now();
  for (const id in sessions) {
    if (now - (sessions[id].lastActivity || sessions[id].createdAt) > SESSION_TTL_MS) {
      delete sessions[id];
      console.log(`[Session] Expired: ${id}`);
    }
  }
}
if (!IS_VERCEL) {
  setInterval(cleanupSessions, 15 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────
//  ADMIN AUTH
// ─────────────────────────────────────────────────────────────
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) return next();
  const auth      = req.headers.authorization || "";
  const bearer    = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerKey = (req.headers["x-admin-key"] || "").trim();
  if (bearer === ADMIN_API_KEY || headerKey === ADMIN_API_KEY) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// ─────────────────────────────────────────────────────────────
//  PUBLIC CONFIG
// ─────────────────────────────────────────────────────────────
app.get("/config", (req, res) => {
  let publicApiUrl = (process.env.PUBLIC_API_URL || "").trim();
  if (!publicApiUrl) {
    const rawProto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const proto    = String(Array.isArray(rawProto) ? rawProto[0] : rawProto.split(",")[0]).trim();
    const rawHost  = req.headers["x-forwarded-host"] || req.get("host") || "";
    const host     = String(Array.isArray(rawHost) ? rawHost[0] : rawHost.split(",")[0]).trim();
    if (host) publicApiUrl = `${proto}://${host}`;
  }
  res.json({
    publicApiUrl:      publicApiUrl || null,
    port:              Number(process.env.PORT) || 3000,
    database:          db.hasDatabaseConfig(),
    adminAuthRequired: Boolean((process.env.ADMIN_API_KEY || "").trim()),
    openai:            Boolean((process.env.OPENAI_API_KEY || "").trim()),
    chatbots:          adminChatbotsForPanel(),
    defaultBot:        normalizeBot(null),
    adminShowAllBots:  process.env.ADMIN_SINGLE_WORKSPACE !== "true",
    memoryWindow:      MEMORY_WINDOW,
  });
});

// ─────────────────────────────────────────────────────────────
//  CHAT ROUTES
// ─────────────────────────────────────────────────────────────

/**
 * POST /chat/session
 * Create new session — returns backend-controlled welcome message.
 * Frontend must call this on load. Never hardcode welcome text in UI.
 */
app.post("/chat/session", (req, res) => {
  try {
    const { sessionId, bot, messages } = createChatSession(req.body?.bot);
    return res.json({ session_id: sessionId, sessionId, bot, messages });
  } catch (err) {
    console.error("[/chat/session]", err?.message || err);
    return res.status(500).json({ error: "Could not start chat session." });
  }
});

/**
 * GET /chat/init
 * Same as POST /chat/session — for GET-only clients (?bot=aeromaverick).
 */
app.get("/chat/init", (req, res) => {
  try {
    const { sessionId, bot, messages } = createChatSession(req.query.bot);
    return res.json({ session_id: sessionId, sessionId, bot, messages });
  } catch (err) {
    console.error("[/chat/init]", err?.message || err);
    return res.status(500).json({ error: "Could not start chat session." });
  }
});

/**
 * POST /chat
 * Main chat endpoint. Memory maintained via session_id.
 * Applies sliding window — last MEMORY_WINDOW messages sent to OpenAI.
 */
app.post("/chat", async (req, res) => {
  try {
    const { session_id, message, bot } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const sessionId = session_id || randomUUID();
    const session   = getSession(sessionId, bot);
    const userMsg   = message.trim();

    // Store in FULL history
    session.messages.push({ role: "user", content: userMsg });

    // Build sliding-window context for OpenAI
    const openAIMessages = buildOpenAIMessages(session.messages);

    console.log(
      `[Chat] ${sessionId.substring(0, 8)}... | ` +
      `stored: ${session.messages.length} | ` +
      `sent: ${openAIMessages.length - 1} (window=${MEMORY_WINDOW})`
    );

    // OpenAI API call
    const completion = await openai.chat.completions.create({
      model:       MODEL,
      max_tokens:  MAX_TOKENS,
      temperature: CHAT_TEMPERATURE,
      messages:    openAIMessages,
    });

    const rawReply = completion.choices[0]?.message?.content || "";

    // Strip lead JSON block from visible reply
    const { leadData, cleanReply } = extractLeadFromReply(rawReply);

    // Store clean reply in FULL history
    session.messages.push({ role: "assistant", content: cleanReply });

    // Save lead to DB / Excel
    let leadSaved = false;
    if (leadData && !session.leadSaved && leadData.email) {
      session.lead = { ...session.lead, ...leadData };
      const persisted = await saveLead(sessionId, session.lead);
      if (persisted) {
        session.leadSaved = true;
        leadSaved = true;
      }
    }

    return res.json({
      session_id: sessionId,
      bot:        session.bot,
      reply:      cleanReply,
      lead_saved: leadSaved,
      lead_data:  leadSaved ? session.lead : null,
    });

  } catch (err) {
    console.error("[/chat]", err?.message || err);
    if (err?.status === 401) return res.status(500).json({ error: "Invalid OpenAI API key." });
    if (err?.status === 429) return res.status(429).json({ error: "OpenAI rate limit reached. Please retry shortly." });
    if (err?.status === 400) return res.status(400).json({ error: "Bad request. Please try again." });
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────
//  LEADS EXPORT
// ─────────────────────────────────────────────────────────────
app.get("/leads", async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="aeromaverick_leads.xlsx"');
    if (db.getPool()) {
      const rows = await db.exportAllLeads();
      const wb   = await workbookFromLeadRows(rows);
      await wb.xlsx.write(res);
      res.end();
      return;
    }
    await ensureLeadsFile();
    const ExcelJS = requireExcelJS();
    const wb      = new ExcelJS.Workbook();
    await wb.xlsx.readFile(LEADS_FILE);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[/leads]", err.message);
    res.status(500).json({ error: "Could not retrieve leads export." });
  }
});

// ─────────────────────────────────────────────────────────────
//  ADMIN ROUTES
// ─────────────────────────────────────────────────────────────
app.get("/admin/leads", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) return res.status(503).json({ error: "Database not configured." });
    const page   = Math.max(1, parseInt(String(req.query.page  || "1"),  10) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25));
    const q      = typeof req.query.q      === "string" ? req.query.q      : "";
    const intent = typeof req.query.intent === "string" ? req.query.intent : "";
    const bot    = resolveAdminBotParam(req.query.bot);
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.listLeads({ limit, offset, q, bot, intent }),
      db.countLeads(q, bot, intent),
    ]);
    return res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    console.error("[/admin/leads]", err.message);
    return res.status(500).json({ error: "Could not load leads." });
  }
});

app.get("/admin/leads/export.csv", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) return res.status(503).json({ error: "Database not configured." });
    const bot  = resolveAdminBotParam(req.query.bot);
    const rows = await db.exportAllLeads(bot);
    const headers = ["id","created_at","bot","session_id","name","email","phone","intent","aircraft_type","budget","notes"];
    const lines   = [headers.join(",")];
    for (const r of rows) {
      const ts = r.created_at ? new Date(r.created_at).toISOString() : "";
      lines.push([
        csvEscape(r.id), csvEscape(ts), csvEscape(r.bot), csvEscape(r.session_id),
        csvEscape(r.name), csvEscape(r.email), csvEscape(r.phone), csvEscape(r.intent),
        csvEscape(r.aircraft_type), csvEscape(r.budget), csvEscape(r.notes),
      ].join(","));
    }
    const fileSlug = bot == null ? "none" : normalizeBot(bot);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="leads_${fileSlug}.csv"`);
    res.send("\ufeff" + lines.join("\n"));
  } catch (err) {
    console.error("[/admin/leads/export.csv]", err.message);
    return res.status(500).json({ error: "Export failed." });
  }
});

app.get("/admin/leads/export.xlsx", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) return res.status(503).json({ error: "Database not configured." });
    const bot      = resolveAdminBotParam(req.query.bot);
    const rows     = await db.exportAllLeads(bot);
    const wb       = await workbookFromLeadRows(rows);
    const fileSlug = bot == null ? "none" : normalizeBot(bot);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="leads_${fileSlug}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[/admin/leads/export.xlsx]", err.message);
    return res.status(500).json({ error: "Export failed." });
  }
});

async function handleAdminLeadsBulkDelete(req, res) {
  try {
    if (!db.getPool()) return res.status(503).json({ error: "Database not configured." });
    const bot = resolveAdminBotParam(req.query.bot);
    if (bot == null) return res.status(400).json({ error: "Invalid workspace" });
    const ids     = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const deleted = await db.deleteLeadsByIds(ids, bot);
    return res.json({ deleted, bot });
  } catch (err) {
    console.error("[/admin/leads delete]", err.message);
    return res.status(500).json({ error: "Could not delete leads." });
  }
}

app.post("/admin/leads/delete", requireAdmin, handleAdminLeadsBulkDelete);
app.delete("/admin/leads",      requireAdmin, handleAdminLeadsBulkDelete);

app.get("/admin/leads/:id", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) return res.status(503).json({ error: "Database not configured." });
    const bot = resolveAdminBotParam(req.query.bot);
    if (bot == null) return res.status(404).json({ error: "Not found" });
    const row = await db.getLeadById(req.params.id, bot);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    console.error("[/admin/leads/:id]", err.message);
    return res.status(500).json({ error: "Could not load lead." });
  }
});

app.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const bot    = resolveAdminBotParam(req.query.bot);
    const intent = typeof req.query.intent === "string" ? req.query.intent : "";
    if (!db.getPool()) return res.json({ leads_total: 0, database: false, bot });
    const total = bot == null ? 0 : await db.countLeads("", bot, intent);
    return res.json({ leads_total: total, database: true, bot });
  } catch (err) {
    console.error("[/admin/stats]", err.message);
    return res.status(500).json({ error: "Stats failed." });
  }
});

// ─────────────────────────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status:        "ok",
    service:       "AeroMaverick Chatbot API",
    timestamp:     new Date().toISOString(),
    sessions:      Object.keys(sessions).length,
    leads_file:    LEADS_FILE,
    database:      db.getPool() ? "configured" : "off",
    admin_panel:   ADMIN_API_KEY ? "auth_required" : "open",
    model:         MODEL,
    memory_window: MEMORY_WINDOW,
    temperature:   CHAT_TEMPERATURE,
  });
});

// ─────────────────────────────────────────────────────────────
//  ADMIN PANEL STATIC FILES
// ─────────────────────────────────────────────────────────────
const ADMIN_DIST_CANDIDATES = [
  path.join(__dirname, "public", "panel"),
  path.join(__dirname, "..", "admin_panel", "dist"),
];
const ADMIN_DIST  = ADMIN_DIST_CANDIDATES.find((d) => fs.existsSync(path.join(d, "index.html"))) || null;
const ADMIN_INDEX = ADMIN_DIST ? path.join(ADMIN_DIST, "index.html") : null;

if (ADMIN_INDEX && fs.existsSync(ADMIN_INDEX)) {
  app.get("/panel", (_req, res) => res.redirect(301, "/panel/"));
  app.use("/panel", express.static(ADMIN_DIST, {
    index:  false,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  }));
  app.use("/panel", (_req, res) => res.sendFile(ADMIN_INDEX));
}

// ─────────────────────────────────────────────────────────────
//  STARTUP
// ─────────────────────────────────────────────────────────────
function logStartupBanner() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  AeroMaverick Chatbot Backend");
  if (!IS_VERCEL) {
    console.log(`  Server        : http://localhost:${PORT}`);
  } else {
    console.log("  Runtime       : Vercel (serverless)");
  }
  console.log(`  Model         : ${MODEL}`);
  console.log(`  Memory Window : last ${MEMORY_WINDOW} messages per session`);
  console.log(`  Temperature   : ${CHAT_TEMPERATURE}`);
  console.log(`  Database      : ${db.hasDatabaseConfig() ? "Postgres configured" : "off (Excel fallback)"}`);
  console.log(`  Leads file    : ${LEADS_FILE}`);
  console.log(`  Admin auth    : ${ADMIN_API_KEY ? "Bearer required" : "⚠ open — set ADMIN_API_KEY"}`);
  console.log("───────────────────────────────────────────────────────");
  console.log("  POST /chat/session   — new session + welcome");
  console.log("  GET  /chat/init      — same (?bot=)");
  console.log("  POST /chat           — chat (sliding window memory)");
  console.log("  GET  /leads          — export xlsx");
  console.log("  GET  /health         — status + memory info");
  console.log("  GET  /config         — public config");
  console.log(`  GET  /admin/leads${ADMIN_API_KEY ? " (Bearer)" : ""}`);
  console.log("  GET  /admin/leads/:id");
  console.log("  POST /admin/leads/delete");
  console.log("  DELETE /admin/leads");
  console.log("  GET  /admin/stats");
  console.log("  GET  /admin/leads/export.csv | export.xlsx");
  if (ADMIN_INDEX && fs.existsSync(ADMIN_INDEX)) {
    console.log("  GET  /panel          — admin UI");
  }
  console.log("═══════════════════════════════════════════════════════");
}

const _startup = [
  db.initDb().catch((e) => console.error("[Startup] DB:", e?.message || e)),
];
if (!IS_VERCEL) {
  _startup.push(
    ensureLeadsFile().catch((e) => console.error("[Startup] Excel:", e?.message || e))
  );
}
Promise.all(_startup).finally(() => {
  if (IS_VERCEL) { logStartupBanner(); return; }
  app.listen(PORT, logStartupBanner);
});

module.exports         = app;
module.exports.default = app;