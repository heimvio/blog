-- 👍/👎-Feedback je Post. Kein Login: Dedupe macht der Client (localStorage);
-- serverseitig bremst nur ein grobes Rate-Limit (ip_hash) Bot-Spam.
CREATE TABLE feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_slug  TEXT NOT NULL,
  vote       TEXT NOT NULL CHECK (vote IN ('up','down')),
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_slug       ON feedback (post_slug);
CREATE INDEX idx_feedback_ip_created ON feedback (ip_hash, created_at);
