# AeroMaverick chatbot API

Node.js + Express backend: `/chat`, `/config`, `/health`, `/admin/*`, `/leads`, static admin UI under `/panel` when the admin build is present.

**Vercel `FUNCTION_INVOCATION_FAILED`:** see **`VERCEL_DEBUG_PROMPT.md`** for where logs live, config reference, and a **copy-paste prompt** for Claude (paste your Runtime log error there).

---

## Deploy on Vercel (Root Directory = `backend`)

In the Vercel project:

1. **Settings → General → Root Directory** → set to **`backend`** (not the monorepo root).
2. **Settings → Environment Variables** → add the variables below for **Production** (and **Preview** if you use previews). Values should match what you use locally in `.env`, but **never commit** real secrets to git.
3. Connect the Git repo and deploy. Build runs `backend/vercel.json`’s `buildCommand`, which builds `admin_panel` and copies output to **`backend/public/panel`** (`backend/scripts/sync-admin-to-public.cjs`).

The repository root intentionally holds only **`backend/`**, **`admin_panel/`**, **`frontend/`**, and **`.gitignore`**. Express entry is always **`backend/server.js`** (set Vercel **Root Directory** to **`backend`**).

### Environment variables to define on Vercel

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes for chat | OpenAI API key (`POST /chat`). |
| `DATABASE_URL` or `POSTGRES_URL` or `POSTGRES_PRISMA_URL` | No* | Postgres (e.g. Neon). Needed for admin leads table + DB persistence. |
| `ADMIN_API_KEY` | No | If set, `/admin/*` requires `Authorization: Bearer …` or `x-admin-key`. |
| `PUBLIC_API_URL` | No | e.g. `https://your-app.vercel.app` for `/config` when behind proxies. |
| `BOT_SLUG` | No | Default bot slug (default `aeromaverick`). |
| `ADMIN_SINGLE_WORKSPACE` | No | Set to `true` to scope admin to one workspace (see `bots.js`). |
| `ADMIN_VISIBLE_BOTS` | No | Comma-separated slugs for admin bot list (see `bots.js`). |
| `SAVE_LEADS_TO_EXCEL` | No | `true` to also write Excel when DB is configured. |

\* Admin JSON API and DB lead storage need a DB URL; `/chat` can run without DB if you only need replies (leads still attempt Excel to `/tmp` on Vercel when DB is off).

**Admin UI build (optional):** If the admin uses a separate API origin or baked-in API key, add for **Build** time in Vercel (so Vite can embed them):

- `VITE_API_BASE` — API origin if not same as the page (usually leave empty when API + `/panel` share `*.vercel.app`).
- `VITE_ADMIN_API_KEY` — only if you want the built admin to send a fixed key (prefer logging in / pasting key in UI if possible).

See also: **`backend/.env.example`** for local copy-paste names only.

---

## Local run

```bash
cd backend
cp .env.example .env
# edit .env
npm install
node server.js
```
