-- Runs automatically the first time the Postgres container starts
-- (mounted into /docker-entrypoint-initdb.d/ by docker-compose.yml)

CREATE TABLE IF NOT EXISTS sessions (
  id                  SERIAL PRIMARY KEY,
  token               TEXT NOT NULL UNIQUE,
  channel             TEXT NOT NULL CHECK (channel IN ('self', 'kiosk')),
  helper_name         TEXT,
  helper_id           TEXT,
  patient_name        TEXT,
  abha_id             TEXT,
  abha_link_consent   BOOLEAN NOT NULL DEFAULT false,
  share_consent       BOOLEAN NOT NULL DEFAULT false,
  chief_complaint     TEXT,
  fields_json         JSONB NOT NULL DEFAULT '{}',
  ayush_flagged       BOOLEAN NOT NULL DEFAULT false,
  ayush_fields_json   JSONB NOT NULL DEFAULT '{}',
  doc_summary         TEXT,
  red_flag_triggered  BOOLEAN NOT NULL DEFAULT false,
  red_flag_result     TEXT,
  fhir_bundle_json    JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups for the staff/triage dashboard, newest first
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at DESC);

-- A simple audit table — every red-flag confirm/stand-down outcome logged
-- separately from the session record itself, per the production design's
-- "red-flag incident logging" security requirement.
CREATE TABLE IF NOT EXISTS red_flag_events (
  id            SERIAL PRIMARY KEY,
  session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
  triggered     BOOLEAN NOT NULL,
  confirmed     BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
