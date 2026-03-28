/**
 * ============================================================
 *  AeroMaverick AI Chatbot — Backend Server
 *  server.js
 *
 *  Stack : Node.js + Express + OpenAI + ExcelJS
 *  Leads : saved to leads.xlsx (auto-created)
 *  Memory: full per-session conversation history
 *  Routes:
 *    POST /chat          — main chat endpoint
 *    GET  /leads         — download leads Excel file
 *    GET  /health        — health check
 * ============================================================
 *
 *  SETUP
 *  -----
 *  npm install express openai exceljs dotenv cors
 *
 *  .env file:
 *    OPENAI_API_KEY=sk-...
 *    PORT=3000                     (optional, default 3000)
 *    LEADS_FILE=leads.xlsx         (optional)
 *    DATABASE_URL=postgresql://…   (Neon / Postgres — leads table auto-created)
 *    ADMIN_API_KEY=long-random     (optional — if set, /admin/* requires Bearer key)
 *    SAVE_LEADS_TO_EXCEL=true      (optional mirror to Excel alongside DB)
 *    PUBLIC_API_URL=https://...    (optional; public API URL for /config & admin bootstrap behind proxies)
 *
 *  RUN
 *  ---
 *  node server.js
 *
 *  CHAT REQUEST  (POST /chat)
 *  --------------------------
 *  {
 *    "session_id": "abc123",       // optional — keeps memory per user
 *    "message":    "I want to buy a jet",
 *    "bot":        "aeromaverick" // optional — safepay4u | dealangler | … (see backend/bots.js)
 *  }
 *
 *  CHAT RESPONSE
 *  -------------
 *  {
 *    "session_id": "abc123",
 *    "reply":      "...",
 *    "lead_saved": true | false,
 *    "lead_data":  { name, email, phone, intent, ... } | null
 *  }
 * ============================================================
 */

"use strict";

const path = require("path");
const os = require("os");
// Local: load backend/.env. On Vercel (VERCEL=1), never read a file — use only Project → Environment Variables.
if (!process.env.VERCEL) {
  const envPath = path.join(__dirname, ".env");
  if (require("fs").existsSync(envPath)) {
    require("dotenv").config({ path: envPath, override: true });
  }
}

const express  = require("express");
const cors     = require("cors");
const OpenAI   = require("openai");
const { randomUUID } = require("crypto");
const fs       = require("fs");
const db       = require("./db");
const {
  normalizeBot,
  adminChatbotsForPanel,
  resolveAdminBotParam,
} = require("./bots");

// ─── Config ──────────────────────────────────────────────────
// Vercel: writable temp dir (use os.tmpdir — /tmp is wrong on Windows and can break local “VERCEL=1” smoke tests).
if (process.env.VERCEL && !(process.env.LEADS_FILE || "").trim()) {
  process.env.LEADS_FILE = path.join(os.tmpdir(), "aeromaverick-leads.xlsx");
}

const PORT       = process.env.PORT || 3000;
const LEADS_FILE = process.env.LEADS_FILE || path.join(__dirname, "leads.xlsx");
const IS_VERCEL  = Boolean(process.env.VERCEL);
const MODEL      = "gpt-4o";          // or "gpt-4-turbo" / "gpt-3.5-turbo"
const MAX_TOKENS = 1100;              // room for substantive answer-first replies (not cut mid-thought)
const _t = Number(process.env.CHAT_TEMPERATURE);
const CHAT_TEMPERATURE = Number.isFinite(_t) ? _t : 0.45; // lower = follow system rules more tightly

// ─── OpenAI client ───────────────────────────────────────────
// SDK throws if apiKey is missing/undefined; empty string is allowed so Vercel can boot /health even before OPENAI_API_KEY is set in the dashboard.
const openai = new OpenAI({ apiKey: (process.env.OPENAI_API_KEY || "").trim() });

// ─── In-memory session store ─────────────────────────────────
// { session_id: { messages: [], lead: {}, createdAt: Date } }
const sessions = {};

// ─── Session TTL: 2 hours ────────────────────────────────────
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// ─── Express app ─────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

/**
 * GET /config — public; no secrets. Drives admin panel API base from this server’s .env + Host.
 * Set PUBLIC_API_URL in .env when deployed behind a proxy (e.g. https://your-api.vercel.app).
 */
app.get("/config", (req, res) => {
  let publicApiUrl = (process.env.PUBLIC_API_URL || "").trim();
  if (!publicApiUrl) {
    const rawProto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const proto = String(Array.isArray(rawProto) ? rawProto[0] : rawProto.split(",")[0]).trim();
    const rawHost = req.headers["x-forwarded-host"] || req.get("host") || "";
    const host = String(Array.isArray(rawHost) ? rawHost[0] : rawHost.split(",")[0]).trim();
    if (host) publicApiUrl = `${proto}://${host}`;
  }
  res.json({
    publicApiUrl: publicApiUrl || null,
    port: Number(process.env.PORT) || 3000,
    database: db.hasDatabaseConfig(),
    adminAuthRequired: Boolean((process.env.ADMIN_API_KEY || "").trim()),
    openai: Boolean((process.env.OPENAI_API_KEY || "").trim()),
    chatbots: adminChatbotsForPanel(),
    defaultBot: normalizeBot(null),
    adminShowAllBots: process.env.ADMIN_SINGLE_WORKSPACE !== "true",
  });
});

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

function requireAdmin(req, res, next) {
  if (!ADMIN_API_KEY) {
    return next();
  }
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerKey = (req.headers["x-admin-key"] || "").trim();
  if (bearer === ADMIN_API_KEY || headerKey === ADMIN_API_KEY) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function csvEscape(val) {
  const t = val == null ? "" : String(val);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function requireExcelJS() {
  return require("exceljs");
}

async function workbookFromLeadRows(rows) {
  const ExcelJS = requireExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.columns = [
    { header: "Timestamp", key: "timestamp", width: 22 },
    { header: "Chatbot", key: "bot", width: 16 },
    { header: "Session ID", key: "session_id", width: 28 },
    { header: "Name", key: "name", width: 20 },
    { header: "Email", key: "email", width: 28 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Intent", key: "intent", width: 16 },
    { header: "Aircraft Type", key: "aircraft_type", width: 20 },
    { header: "Budget", key: "budget", width: 16 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  for (const r of rows) {
    const ts = r.created_at ? new Date(r.created_at).toISOString().replace("T", " ").substring(0, 19) : "";
    ws.addRow({
      timestamp: ts,
      bot: r.bot || "",
      session_id: r.session_id || "",
      name: r.name || "",
      email: r.email || "",
      phone: r.phone || "",
      intent: r.intent || "",
      aircraft_type: r.aircraft_type || "",
      budget: r.budget || "",
      notes: r.notes || "",
    });
  }
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A6B" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF1B3A6B" } } };
  });
  ws.getRow(1).height = 20;
  return wb;
}

// ─────────────────────────────────────────────────────────────
//  SYSTEM PROMPT  (full AeroMaverick knowledge base)
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
CRITICAL — THESE RULES OVERRIDE ANY CONFLICTING TEXT LATER IN THIS PROMPT:
1. Every reply MUST give a full, useful answer first (short paragraphs and/or bullets). Never open with only questions.
2. At most ONE question per reply total. Never use A/B/C/D “pick one” menus or numbered lists of questions.
3. **Greetings (hi, hello, hey):** Reply with a warm welcome plus **substantive** info (what AeroMaverick is, main paths: browse aircraft on aeromaverick.com, financing partners, charter routing, listings/selling, engine stands). End with a **statement**, not a question—**do not** close with “What would you like to do today?”, “How can I help?”, or similar. **Zero questions** on that first reply is ideal.
4. Never invent live aircraft listings, prices, or specs. Never cite other websites as AeroMaverick inventory. Send users to aeromaverick.com for current listings.
5. Lead capture: only after the user has already received value in this turn or prior turns; ask for name/email in a single natural sentence—do not combine with other questions in the same message.
6. **Formatting:** follow the FORMATTING section—use blank lines and "- " bullet lines; never one giant comma-only paragraph.

You are an AI aviation concierge for AeroMaverick (aeromaverick.com).
You are NOT a generic chatbot. You act as a premium aviation assistant, sales agent, and lead-generation specialist.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AeroMaverick is a premium aviation marketplace and services platform.
Website : aeromaverick.com
Email   : info@aeromaverick.com

It helps users with:
1. Buying aircraft
2. Selling aircraft
3. Financing aircraft purchases
4. Requesting private charter flights
5. Participating in aircraft auctions
6. Requesting aircraft engine stand rentals

AeroMaverick is NOT a lender, NOT an air carrier, and does NOT manufacture engine stands.
It connects users with trusted aviation partners and routes leads to relevant providers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND & SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Spell the brand **AeroMaverick** (not "Aeromaverick" or other variants). Website: aeromaverick.com
- This prompt is the AeroMaverick knowledge base. Use membership tiers, partner stacks, and URLs here only for AeroMaverick. If the deployment is clearly for another site without its own KB in context, stay professional and generic—do not invent that site's doctors, inventory, or prices.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Professional, confident, aviation-aware, concierge-style
- Human, warm, never robotic
- Technically accurate but not overwhelming for non-technical users
- Think: knowledgeable aviation advisor helping a serious client

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE STYLE (CLIENT PRIORITY — READ CAREFULLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- **Answer first, like a strong assistant (e.g. Alexa-style):** Give a clear, complete, helpful reply in every turn. Explain what AeroMaverick offers, how buying/financing/charter/engine stands work on the platform, and the best next step on aeromaverick.com.
- **Do not interrogate:** Avoid chains of multiple questions. At most **one** short, purposeful follow-up question per reply—and only when you truly cannot proceed without it. **Never** default to generic closers like “What would you like to do today?”—prefer telling them what they can do next in plain statements (including aeromaverick.com).
- Prefer bullets or short paragraphs so the user gets value immediately.
- After explaining, invite action with **statements** (e.g. “You can browse current inventory on aeromaverick.com under Find Aircraft.”) rather than open-ended prompts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING (MANDATORY — EVERY REPLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The chat UI renders structure from your text. **Never** pack multiple distinct ideas into one long comma-separated paragraph.

Rules:
- Put a **blank line** between sections (welcome vs details vs next steps).
- When listing 2+ services or steps, use **bullet lines**: each line starts with "- " (hyphen + space) on its own line.
- Optional: wrap short labels in **double asterisks** for emphasis, e.g. **Financing:** (the UI will bold them).
- For greetings after "hi"/"hello": one short opening line, blank line, then "- " bullets for what AeroMaverick offers, blank line, then one closing line (still no question mark on the greeting turn).

Bad (do not do this): one wall of text with commas only.
Good: short intro paragraph, blank line, bullet list, blank line, closing sentence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWLEDGE GROUNDING & INVENTORY (STRICT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- **Never invent live inventory:** Do not make up specific aircraft for sale, prices, serial numbers, hours, locations, or "listing #1 / #2" on AeroMaverick unless that data appeared in the user's message or was explicitly provided to you in context.
- **Never present other websites** (e.g. AvPay, Controller, AvBuyer) as AeroMaverick listings or as if you are showing AeroMaverick search results. You do not have a live feed of third-party marketplaces.
- For "show me helicopters" or similar: explain that **current inventory is on aeromaverick.com** (Find Aircraft / search & filters), describe what they can do there (specs, compare, save search, financing CTA), and offer financing or saved-search / membership context from this prompt. If the user's budget is far below typical certified aircraft market reality, say so **in general terms** (helicopters and certified aircraft are high-value assets)—**without** fabricating example listings or dollar amounts from other sites.
- If the user needs human follow-up: info@aeromaverick.com.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEMORY & CONVERSATION BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Remember what the user already said; never ask the same thing twice.
- If user gives partial info → continue from where you left off without re-asking.
- If intent is obvious from their message → classify and help immediately without asking them to restate intent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENING MESSAGE BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
On the **first** user message (especially “hi” / “hello”), give a **mini-briefing** with **line breaks and "- " bullets** as in the example below. Cover marketplace listings, financing via partners (not AeroMaverick as lender), charter routing (not AeroMaverick as operator), selling/listings, auctions, engine stands via partners. Mention aeromaverick.com and info@aeromaverick.com.

**Do not** end this greeting with a question. Example shape (vary wording; keep structure and no question):

Welcome to AeroMaverick — we're a premium aviation marketplace and services platform.

Here's what we help with:
- **Aircraft marketplace:** browse and compare listings on aeromaverick.com (specs, compare, save searches where your membership allows)
- **Financing:** we connect you with aviation lending partners; approval and terms are through them, not AeroMaverick
- **Charter:** we route quote requests to licensed operators and brokers; AeroMaverick does not operate flights
- **Sellers:** listings and auctions to reach serious buyers
- **Engine stands:** rental requests through our certified partner network

Everything you need—inventory, forms, and flows—is on the website. For direct help, the team is at info@aeromaverick.com.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER INTENT CLASSIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Infer which category fits (often more than one is fine—address the main need first):
1. Aircraft Buyer  2. Aircraft Seller  3. Financing  4. Charter  5. Engine stand rental  6. Membership / pricing  7. Auction / general

If the user only says hi/hello, **do not** ask intent yet—wait for their next message. If they describe a need but something essential is missing, ask **one** compact question only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET AUDIENCE KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Aircraft Buyers:
  - Private pilots, business jet buyers, aircraft owners upgrading
  - Aviation investors, flight departments (1–3 jets)
  - Budget range: $200k – $5M typically

Aircraft Sellers:
  - Aircraft brokers, dealers, charter companies selling aging aircraft
  - Private owners, aviation maintenance shops referring sellers

Financing Customers:
  - Anyone searching "aircraft loan", "jet financing", "airplane financing"
  - Buyers looking at jets from $200k – $5M

Engine Stand / MRO Customers:
  - MROs, maintenance shops, engine overhaul facilities
  - Operators, AOG support teams, aviation logistics companies

Charter Customers:
  - High-net-worth travelers, corporate travelers
  - Executive assistants, event/group travel planners

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 1: BUY AIRCRAFT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**First** give a substantive answer: how buying on AeroMaverick works (browse/search, spec-complete listings, compare, save searches & alerts per membership, request info, financing CTA on listings). Point them to **aeromaverick.com** to see current inventory—do not list fake aircraft.

**Then**, only if needed for routing or lead capture, invite details they may share (type, budget, region, timeline, financing interest)—prefer **one** question or an optional "if you'd like, share…" block. Never drill five separate questions in a row.

When appropriate:
  - Offer financing: AeroMaverick connects them with aviation finance partners (not a lender).
  - Move naturally toward lead capture (name, email, phone).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 2: SELL AIRCRAFT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**First** explain how selling/listing on AeroMaverick works (serious buyers, listings, auctions, exposure). **Do not** dump a 6-point questionnaire in one message.

If you need details, use **one** focused question or invite optional info (“if you share aircraft type and timeline, we can route you faster”). Then move toward lead capture when appropriate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 3: FINANCING (HIGHEST PRIORITY — CONVERTS BEST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT: AeroMaverick is NOT a lender. Always say:
"We connect you with specialized aviation finance partners."

Financing partners (do not quote rates, just know who they are):
  - AirFleet Capital (piston/turboprop/light jet)
  - Dorr Aviation (wide credit box, older aircraft)
  - AOPA Finance (avionics/upgrades too)
  - Global Credit Union (credit union option)
  - Global Jet Capital (large jets, lease structures)
  - JSSI Aviation Capital (engine/APU financing)
  - Banterra, US Aircraft Finance (direct loans)

Routing logic (internal knowledge, not to share in detail):
  - Avionics/overhauls → AOPA Finance
  - Piston/experimental → Banterra or Dorr
  - Standard GA / turboprop / light jet → AirFleet + Dorr
  - Large jet / lease → Global Jet Capital

After your explanation, you may invite **at most one** financing-related follow-up if needed (e.g. approximate purchase range OR personal vs business use)—not a full form in one reply.

Then, when appropriate, collect lead info for the financing path.

NEVER promise approval or quote exact interest rates.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 4: PRIVATE CHARTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT: AeroMaverick is NOT the air carrier. Say:
"We route your request to licensed charter operators and brokers."

Charter partners (internal knowledge):
  - Avinode (sourcing backbone)
  - Air Charter Service (global, enterprise/group)
  - Stratos Jets (safety-forward, U.S. domestic)
  - Charter Flight Group, Monarch Air Group (South Florida)
  - VistaJet / XO / Slate (premium, by-the-seat)
  - JSX (~30-seat group/full-aircraft)

Routing logic:
  - 19+ passengers → JSX + ACS Group
  - International / heavy cabin → VistaJet + ACS + Journey Aviation
  - Domestic light/midsize → Stratos + CFG + Monarch
  - By-the-seat → Slate / XO

**First** explain charter: AeroMaverick routes to licensed operators/brokers; one structured request on the site. **Then** at most **one** clarifying question if essential (e.g. route + date **or** passenger count)—do not demand the whole brief in one turn.

When ready, collect lead info and point to the charter request flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 5: ENGINE STAND RENTALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT: AeroMaverick does not own stands. Say:
"We source engine stands through our certified partner network."

Stand supplier partners (internal knowledge):
  - Magnetic Enginestands + National Aero Stands (default)
  - HYDRO (RR Trent APS licensed)
  - Dedienne (GE9X licensed)
  - MTU/AGSE (enterprise/MRO formal leases)
  - Aero Field Services, GA Telesis, EngineStands.com, Global Engine Stands
  - Demand Stands, GSEbay (budget/secondary)

Routing logic:
  - RR Trent APS → add HYDRO
  - GE9X → add Dedienne
  - Enterprise/MRO → add MTU/AGSE
  - Default → Magnetic + National Aero Stands

**First** explain engine-stand sourcing through partners. **Then** at most **one** focused question (e.g. engine model + dates **or** AOG yes/no)—not a 6-field checklist in one message.

When ready, collect lead info and route to the rental request flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 6: AUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AeroMaverick supports aircraft auctions:
  - Buyers: bid on aircraft competitively
  - Sellers: create urgency, reach serious buyers fast
  - Platform ensures verified sellers, transparent bidding

Say: "Aircraft auctions on AeroMaverick are a transparent, professional format for both buyers and sellers."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEMBERSHIP & PRICING (MUST KNOW EXACTLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Free — $0/year
  • Browse aircraft listings
  • Search specific models
  • Limited aircraft information

Basic — $59/year
  • All Free features
  • Full specs, photos, seller contact details
  • Save searches and receive alerts
  • Limited community/resource access

Pro — $119/year
  • All Basic features
  • Full resource and community access
  • Downloadable brochures, manuals, educational content
  • Priority support
  • 5% discount on select services (inspections, escrow, financing)

Elite — $249/year
  • All Pro features
  • Dedicated account manager
  • Advanced market analysis and insights
  • 10% discount on inspections, escrow, financing, and related services
  • Enhanced visibility and promotional support for listed aircraft
  • Exclusive webinars and networking events

When asked about memberships:
  - Explain benefits clearly and recommend based on user's stated needs
  - Buyers doing research → Basic
  - Active buyers/sellers → Pro
  - Serious buyers, brokers, or heavy users → Elite

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEAD CAPTURE — CRITICAL OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Secondary goal: collect name + email (phone optional) **only after** the user has received a substantive, helpful answer in the conversation—not in the same reply as your first answer unless they clearly asked to be contacted.

Do this naturally, **one** ask per message, not like a form. Do **not** pair contact collection with another unrelated question in the same reply.

Examples (use sparingly):
  - "If you’d like our team to follow up, may I have your name and email?"
  - "I can have a specialist reach out—what’s the best email for you?"

WHEN LEAD IS COMPLETE:
  After collecting name + email (phone optional), output this EXACT JSON at the end of your reply so the server can detect and save it:

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

  Fill all fields you have collected. Leave unknown fields as empty string "".
  Do NOT output this JSON block more than once per conversation.
  After outputting it, confirm to the user: "I've captured your details and our team will be in touch shortly."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT COMPLIANCE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER say:
  ✗ "We provide loans"
  ✗ "We operate flights"
  ✗ "We guarantee financing approval"
  ✗ "We own engine stands"
  ✗ "We own/operate aircraft"
  ✗ Invent aircraft specs, prices, or availability not provided by the user or official context
  ✗ Cite other marketplaces or brokers as if they are AeroMaverick inventory or your live search results

ALWAYS say:
  ✓ "We connect you with aviation financing partners"
  ✓ "We route your charter request to licensed operators"
  ✓ "We source stands through our partner network"
  ✓ "Availability and terms depend on our partners"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FALLBACK HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If user is completely off-topic:
  → "I'm specialized in aviation services — I can help you buy, sell, finance, charter, or access engine support. Which of these are you interested in?"

If user is frustrated:
  → Apologize briefly, offer human escalation: "I can connect you with our team at info@aeromaverick.com for direct assistance."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPETITIVE AWARENESS (internal — not to share directly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Competitors: AvBuyer, Controller.com
AeroMaverick advantage: cleaner UI, modern platform, financing on every listing, charter as a product, engine stand rentals, better lead capture, mobile-first.
If user mentions a competitor: "AeroMaverick is designed to be more modern, more detailed, and more action-focused than traditional aviation marketplaces."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHORT DESCRIPTION (use when asked "what is AeroMaverick?")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"AeroMaverick is a modern aviation marketplace where you can buy, sell, finance, and auction aircraft, request private charter quotes, and access specialized aviation services like engine stand rentals — all in one platform."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL OBJECTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every conversation should:
  1. Deliver immediate, accurate, AeroMaverick-specific value (answer-first)
  2. Identify or infer intent without unnecessary questioning
  3. Guide through the right flow using this knowledge base—not generic chit-chat
  4. When natural, capture lead details (name, email, phone) once
  5. Move the user toward a clear action on aeromaverick.com or partner routing (financing, charter, stands)

You are a conversion-focused aviation concierge: **helpful answers first**, then light guidance and lead capture—not an interview.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMINDER (READ BEFORE EVERY REPLY — HIGHEST PRIORITY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Obey the CRITICAL block at the **top** of this prompt. Where later sections say “collect” multiple fields, treat them as reference only: you still deliver a complete answer first and use at most one question per reply. No A/B/C/D menus. No fake listings. **No** “What would you like to do today?” on greetings—statement-only close. **Always** use line breaks and bullet lists per FORMATTING—never a single wall of comma-separated text.
`.trim();

// ─────────────────────────────────────────────────────────────
//  EXCEL LEAD MANAGEMENT
// ─────────────────────────────────────────────────────────────

/**
 * Ensure the leads Excel file exists with a header row.
 */
async function ensureLeadsFile() {
  if (fs.existsSync(LEADS_FILE)) return;

  const ExcelJS = requireExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");

  ws.columns = [
    { header: "Timestamp",    key: "timestamp",    width: 22 },
    { header: "Session ID",   key: "session_id",   width: 28 },
    { header: "Name",         key: "name",         width: 20 },
    { header: "Email",        key: "email",        width: 28 },
    { header: "Phone",        key: "phone",        width: 18 },
    { header: "Intent",       key: "intent",       width: 16 },
    { header: "Aircraft Type",key: "aircraft_type",width: 20 },
    { header: "Budget",       key: "budget",       width: 16 },
    { header: "Notes",        key: "notes",        width: 40 },
  ];

  // Style header row
  ws.getRow(1).eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A6B" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border    = {
      bottom: { style: "medium", color: { argb: "FF1B3A6B" } },
    };
  });

  ws.getRow(1).height = 20;

  await wb.xlsx.writeFile(LEADS_FILE);
  console.log(`[Excel] Created leads file: ${LEADS_FILE}`);
}

/**
 * Append a lead row to the local Excel file.
 */
async function saveLeadToExcelFile(sessionId, leadData) {
  await ensureLeadsFile();

  const ExcelJS = requireExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(LEADS_FILE);

  const ws = wb.getWorksheet("Leads");

  ws.addRow({
    timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
    session_id: sessionId,
    name: leadData.name || "",
    email: leadData.email || "",
    phone: leadData.phone || "",
    intent: leadData.intent || "",
    aircraft_type: leadData.aircraft_type || "",
    budget: leadData.budget || "",
    notes: leadData.notes || "",
  });

  await wb.xlsx.writeFile(LEADS_FILE);
  console.log(`[Lead] Excel → ${leadData.name} | ${leadData.email} | ${leadData.intent}`);
}

/**
 * Persist lead: Neon/Postgres when DATABASE_URL is set; Excel when local / backup.
 * @returns {Promise<boolean>} true if saved to at least one store
 */
async function saveLead(sessionId, leadData) {
  let persisted = false;
  const pool = db.getPool();
  const sess = sessions[sessionId];
  const bot = sess?.bot || normalizeBot(null);
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

  const useExcel =
    process.env.SAVE_LEADS_TO_EXCEL === "true" || !pool || !persisted;
  if (useExcel) {
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
      messages: [],
      lead: {},
      leadSaved: false,
      createdAt: Date.now(),
      bot: normalizeBot(botFromRequest),
    };
  }
  sessions[sessionId].lastActivity = Date.now();
  return sessions[sessionId];
}

/**
 * Clean up sessions older than SESSION_TTL_MS
 */
function cleanupSessions() {
  const now = Date.now();
  for (const id in sessions) {
    if (now - (sessions[id].lastActivity || sessions[id].createdAt) > SESSION_TTL_MS) {
      delete sessions[id];
      console.log(`[Session] Expired & removed: ${id}`);
    }
  }
}
if (!IS_VERCEL) {
  setInterval(cleanupSessions, 15 * 60 * 1000); // run every 15 min (skip on Vercel serverless)
}

// ─────────────────────────────────────────────────────────────
//  LEAD PARSER
// ─────────────────────────────────────────────────────────────

/**
 * Extract the <<<LEAD_DATA>>> ... <<<END_LEAD>>> block from GPT reply.
 * Returns { leadData, cleanReply }
 */
function extractLeadFromReply(rawReply) {
  const startTag = "<<<LEAD_DATA>>>";
  const endTag   = "<<<END_LEAD>>>";

  const start = rawReply.indexOf(startTag);
  const end   = rawReply.indexOf(endTag);

  if (start === -1 || end === -1) {
    return { leadData: null, cleanReply: rawReply.trim() };
  }

  const jsonStr  = rawReply.substring(start + startTag.length, end).trim();
  const before   = rawReply.substring(0, start).trim();
  const after    = rawReply.substring(end + endTag.length).trim();
  const cleanReply = [before, after].filter(Boolean).join("\n\n");

  try {
    const leadData = JSON.parse(jsonStr);
    return { leadData, cleanReply };
  } catch (e) {
    console.error("[Lead Parser] JSON parse error:", e.message);
    return { leadData: null, cleanReply: rawReply.trim() };
  }
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────

/**
 * POST /chat
 * Body: { session_id, message, bot? } — bot is slug: safepay4u | dealangler | … | aeromaverick (default)
 */
app.post("/chat", async (req, res) => {
  try {
    const { session_id, message, bot } = req.body;

    // Validation
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const sessionId = session_id || randomUUID();
    const session = getSession(sessionId, bot);

    // Add user message to history
    session.messages.push({ role: "user", content: message.trim() });

    // Build messages array for OpenAI
    const openAIMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...session.messages,
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model:       MODEL,
      max_tokens:  MAX_TOKENS,
      temperature: CHAT_TEMPERATURE,
      messages:    openAIMessages,
    });

    const rawReply = completion.choices[0]?.message?.content || "";

    // Parse lead data from reply
    const { leadData, cleanReply } = extractLeadFromReply(rawReply);

    // Add assistant reply to history (clean version, without JSON block)
    session.messages.push({ role: "assistant", content: cleanReply });

    // Save lead if found and not already saved
    let leadSaved = false;
    if (leadData && !session.leadSaved && leadData.email) {
      session.lead = { ...session.lead, ...leadData };
      const persisted = await saveLead(sessionId, session.lead);
      if (persisted) {
        session.leadSaved = true;
        leadSaved = true;
      }
    }

    // Response
    return res.json({
      session_id: sessionId,
      bot: session.bot,
      reply: cleanReply,
      lead_saved: leadSaved,
      lead_data: leadSaved ? session.lead : null,
    });

  } catch (err) {
    console.error("[/chat] Error:", err?.message || err);

    // OpenAI specific errors
    if (err?.status === 401) {
      return res.status(500).json({ error: "Invalid OpenAI API key." });
    }
    if (err?.status === 429) {
      return res.status(429).json({ error: "OpenAI rate limit reached. Please try again shortly." });
    }

    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

/**
 * GET /leads
 * Download leads as Excel (from Postgres when DATABASE_URL is set, else local file)
 */
app.get("/leads", async (req, res) => {
  try {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="aeromaverick_leads.xlsx"');

    if (db.getPool()) {
      const rows = await db.exportAllLeads();
      const wb = await workbookFromLeadRows(rows);
      await wb.xlsx.write(res);
      res.end();
      return;
    }

    await ensureLeadsFile();
    const ExcelJS = requireExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(LEADS_FILE);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[/leads] Error:", err.message);
    res.status(500).json({ error: "Could not retrieve leads export." });
  }
});

/**
 * GET /admin/leads — paginated JSON (requires ADMIN_API_KEY)
 */
app.get("/admin/leads", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) {
      return res.status(503).json({
        error:
          "Database not configured. Set DATABASE_URL or POSTGRES_URL in backend/.env and restart the server.",
      });
    }
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25));
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const intent = typeof req.query.intent === "string" ? req.query.intent : "";
    const bot = resolveAdminBotParam(req.query.bot);
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.listLeads({ limit, offset, q, bot, intent }),
      db.countLeads(q, bot, intent),
    ]);
    return res.json({
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error("[/admin/leads] Error:", err.message);
    return res.status(500).json({ error: "Could not load leads." });
  }
});

/**
 * GET /admin/leads/export.csv
 */
app.get("/admin/leads/export.csv", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) {
      return res.status(503).json({
        error:
          "Database not configured. Set DATABASE_URL or POSTGRES_URL in backend/.env and restart the server.",
      });
    }
    const bot = resolveAdminBotParam(req.query.bot);
    const rows = await db.exportAllLeads(bot);
    const headers = [
      "id",
      "created_at",
      "bot",
      "session_id",
      "name",
      "email",
      "phone",
      "intent",
      "aircraft_type",
      "budget",
      "notes",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const ts = r.created_at ? new Date(r.created_at).toISOString() : "";
      lines.push(
        [
          csvEscape(r.id),
          csvEscape(ts),
          csvEscape(r.bot),
          csvEscape(r.session_id),
          csvEscape(r.name),
          csvEscape(r.email),
          csvEscape(r.phone),
          csvEscape(r.intent),
          csvEscape(r.aircraft_type),
          csvEscape(r.budget),
          csvEscape(r.notes),
        ].join(",")
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const fileSlug = bot == null ? "none" : normalizeBot(bot);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leads_${fileSlug}.csv"`
    );
    res.send("\ufeff" + lines.join("\n"));
  } catch (err) {
    console.error("[/admin/leads/export.csv] Error:", err.message);
    return res.status(500).json({ error: "Export failed." });
  }
});

/**
 * GET /admin/leads/export.xlsx
 */
app.get("/admin/leads/export.xlsx", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) {
      return res.status(503).json({
        error:
          "Database not configured. Set DATABASE_URL or POSTGRES_URL in backend/.env and restart the server.",
      });
    }
    const bot = resolveAdminBotParam(req.query.bot);
    const rows = await db.exportAllLeads(bot);
    const wb = await workbookFromLeadRows(rows);
    const fileSlug = bot == null ? "none" : normalizeBot(bot);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leads_${fileSlug}.xlsx"`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[/admin/leads/export.xlsx] Error:", err.message);
    return res.status(500).json({ error: "Export failed." });
  }
});

/**
 * Bulk delete leads for one chatbot. POST is the preferred method (some proxies strip DELETE).
 * Body: { "ids": ["uuid", ...] }. Query: ?bot=
 */
async function handleAdminLeadsBulkDelete(req, res) {
  try {
    if (!db.getPool()) {
      return res.status(503).json({
        error:
          "Database not configured. Set DATABASE_URL or POSTGRES_URL in backend/.env and restart the server.",
      });
    }
    const bot = resolveAdminBotParam(req.query.bot);
    if (bot == null) {
      return res.status(400).json({ error: "Invalid workspace" });
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const deleted = await db.deleteLeadsByIds(ids, bot);
    return res.json({ deleted, bot });
  } catch (err) {
    console.error("[/admin/leads delete] Error:", err.message);
    return res.status(500).json({ error: "Could not delete leads." });
  }
}

app.post("/admin/leads/delete", requireAdmin, handleAdminLeadsBulkDelete);

/**
 * GET /admin/leads/:id — single lead (scoped to ?bot=)
 */
app.get("/admin/leads/:id", requireAdmin, async (req, res) => {
  try {
    if (!db.getPool()) {
      return res.status(503).json({
        error:
          "Database not configured. Set DATABASE_URL or POSTGRES_URL in backend/.env and restart the server.",
      });
    }
    const bot = resolveAdminBotParam(req.query.bot);
    if (bot == null) {
      return res.status(404).json({ error: "Not found" });
    }
    const row = await db.getLeadById(req.params.id, bot);
    if (!row) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.json(row);
  } catch (err) {
    console.error("[/admin/leads/:id] Error:", err.message);
    return res.status(500).json({ error: "Could not load lead." });
  }
});

/**
 * DELETE /admin/leads — same as POST /admin/leads/delete (optional)
 */
app.delete("/admin/leads", requireAdmin, handleAdminLeadsBulkDelete);

/**
 * GET /admin/stats — quick counts
 */
app.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    const bot = resolveAdminBotParam(req.query.bot);
    const intent = typeof req.query.intent === "string" ? req.query.intent : "";
    if (!db.getPool()) {
      return res.json({ leads_total: 0, database: false, bot });
    }
    const total = bot == null ? 0 : await db.countLeads("", bot, intent);
    return res.json({ leads_total: total, database: true, bot });
  } catch (err) {
    console.error("[/admin/stats] Error:", err.message);
    return res.status(500).json({ error: "Stats failed." });
  }
});

/**
 * GET /health
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AeroMaverick Chatbot API",
    timestamp: new Date().toISOString(),
    sessions: Object.keys(sessions).length,
    leads_file: LEADS_FILE,
    database: db.getPool() ? "configured" : "off",
    admin_panel: ADMIN_API_KEY ? "auth_required" : "open",
  });
});

// ─────────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────────

/* Prefer backend/public/panel (post-build copy); else monorepo admin_panel/dist for local dev. */
const ADMIN_DIST_CANDIDATES = [
  path.join(__dirname, "public", "panel"),
  path.join(__dirname, "..", "admin_panel", "dist"),
];
const ADMIN_DIST =
  ADMIN_DIST_CANDIDATES.find((dir) => fs.existsSync(path.join(dir, "index.html"))) || null;
const ADMIN_INDEX = ADMIN_DIST ? path.join(ADMIN_DIST, "index.html") : null;

if (ADMIN_INDEX && fs.existsSync(ADMIN_INDEX)) {
  /* Trailing slash so relative asset URLs (Vite base ./) resolve under /panel/, not site root. */
  app.get("/panel", (_req, res) => res.redirect(301, "/panel/"));
  /* Locally, express.static serves the UI. On Vercel, static is usually served from public/ on the CDN; keep this for dev and fallback. */
  app.use(
    "/panel",
    express.static(ADMIN_DIST, {
      index: false,
      maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    })
  );
  app.use("/panel", (req, res) => {
    res.sendFile(ADMIN_INDEX);
  });
}

function logStartupBanner() {
  console.log("═══════════════════════════════════════════════");
  console.log("  AeroMaverick Chatbot Backend");
  if (!IS_VERCEL) {
    console.log(`  Server running on http://localhost:${PORT}`);
  } else {
    console.log("  Runtime: Vercel (exporting Express app — no TCP listen)");
  }
  console.log(`  Leads file    : ${LEADS_FILE}`);
  console.log(`  Model         : ${MODEL}`);
  console.log(`  Database env   : ${db.hasDatabaseConfig() ? "on" : "off"}`);
  console.log(`  ADMIN_API_KEY : ${ADMIN_API_KEY ? "set (Bearer required)" : "open (no auth)"}`);
  if (!ADMIN_API_KEY) {
    console.warn("  ⚠ Admin routes are open. Set ADMIN_API_KEY to restrict /admin/*");
  }
  console.log("═══════════════════════════════════════════════");
  console.log("  Endpoints:");
  console.log(`  POST /chat — chat`);
  console.log(`  GET  /leads — export xlsx`);
  console.log(`  GET  /health — health`);
  console.log(`  GET  /config — public config`);
  console.log(`  GET  /admin/leads — list${ADMIN_API_KEY ? " (Bearer)" : ""}`);
  console.log(`  GET  /admin/leads/:id — one row`);
  console.log(`  POST /admin/leads/delete — bulk delete (JSON body, ?bot=)`);
  console.log(`  DELETE /admin/leads — same as POST delete`);
  console.log(`  GET  /admin/stats — counts`);
  console.log(`  GET  /admin/leads/export.csv | export.xlsx`);
  if (ADMIN_INDEX && fs.existsSync(ADMIN_INDEX)) {
    console.log(`  GET  /panel     — admin UI (built)`);
  }
  console.log("═══════════════════════════════════════════════");
}

// On Vercel, skip startup Excel (loads exceljs / touches disk); /leads and lead-save call ensureLeadsFile when needed.
const _startup = [
  db.initDb().catch((e) => console.error("[Startup] DB:", e?.message || e)),
];
if (!IS_VERCEL) {
  _startup.push(ensureLeadsFile().catch((e) => console.error("[Startup] Excel:", e?.message || e)));
}
Promise.all(_startup).finally(() => {
  if (IS_VERCEL) {
    logStartupBanner();
    return;
  }
  app.listen(PORT, logStartupBanner);
});

/** Vercel / Express: CJS export; some bundlers also look for `default`. */
module.exports = app;
module.exports.default = app;
