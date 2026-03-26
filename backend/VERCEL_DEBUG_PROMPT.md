# Vercel `FUNCTION_INVOCATION_FAILED` — where the issue is & AI prompt

The browser only shows **500 / FUNCTION_INVOCATION_FAILED** and an ID. **That is not the root cause** — it means the Node serverless process **crashed or never returned** before Vercel could respond normally.

## Repository layout (intentional)

At the **Git repository root** you should see **only**:

- `backend/`
- `frontend/`
- `admin_panel/`
- `.gitignore`

All API code, `backend/vercel.json`, and `backend/scripts/sync-admin-to-public.cjs` live under **`backend/`**. There is **no** root `package.json` or root `server.js`.

---

## Where the real error is

1. **Vercel** → project → **Deployments** → latest.
2. **Build Logs** — if install/build fails, fix that first.
3. **Runtime / Functions Logs** — copy the **first `Error:` / stack** line.

---

## Vercel setting

**Root Directory** = **`backend`**

Active config: **`backend/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install",
  "buildCommand": "npm install --prefix ../admin_panel && npm run build --prefix ../admin_panel && node scripts/sync-admin-to-public.cjs"
}
```

### `backend/package.json` (dependencies)

```json
{
  "scripts": { "start": "node server.js" },
  "engines": { "node": ">=18" },
  "dependencies": {
    "cors": "^2.8.6",
    "dotenv": "^17.3.1",
    "exceljs": "^4.4.0",
    "express": "4.21.2",
    "openai": "^6.33.0",
    "pg": "^8.13.1"
  }
}
```

**Session IDs** use Node built-in `require("crypto").randomUUID()` (no `uuid` package — avoids ESM/CJS issues).

**Admin static:** build copies `admin_panel/dist` → **`backend/public/panel`**; `server.js` also falls back to **`../admin_panel/dist`**.

---

## Copy-paste prompt for Claude (or another AI)

Paste your **full Runtime log error** where indicated.

```
You are a senior Node.js + Vercel engineer. I get in the browser:
  500 INTERNAL_SERVER_ERROR / FUNCTION_INVOCATION_FAILED

Monorepo root contains ONLY: backend/, admin_panel/, frontend/, .gitignore

Vercel Root Directory = "backend".
Express entry: backend/server.js (CommonJS, Express 4.21.2).

backend/vercel.json:
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install",
  "buildCommand": "npm install --prefix ../admin_panel && npm run build --prefix ../admin_panel && node scripts/sync-admin-to-public.cjs"
}

Session IDs: const { randomUUID } = require("crypto"); — no uuid npm package.
On VERCEL: no dotenv file; OpenAI uses (process.env.OPENAI_API_KEY || "").trim(); LEADS_FILE under os.tmpdir(); startup skips ensureLeadsFile; setInterval disabled; module.exports = app && module.exports.default = app.

[PASTE RUNTIME / BUILD LOG ERROR HERE]

1) Root cause from logs.
2) Minimal patch (files + code).
3) Required Vercel env vars (OPENAI_API_KEY, DATABASE_URL, etc.).
```

---

After fixes: redeploy, then `GET /health`, then `POST /chat`.
