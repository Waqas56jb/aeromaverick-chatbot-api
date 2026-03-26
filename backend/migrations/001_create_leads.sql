-- AeroMaverick — leads storage (Neon / PostgreSQL)
-- Run this once in the Neon SQL Editor if you prefer manual setup.
-- Otherwise the app auto-creates the table on startup via db.js.

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

ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot TEXT NOT NULL DEFAULT 'aeromaverick';
CREATE INDEX IF NOT EXISTS idx_leads_bot ON leads (bot);

COMMENT ON TABLE leads IS 'Leads per chatbot (bot slug): safepay4u, dealangler, aeromaverick, …';
