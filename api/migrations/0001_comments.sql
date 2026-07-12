-- Blog-Kommentare (siehe blog_ARCHITECTURE.md).
-- ip_hash: HMAC(ip, COMMENT_IP_HASH_SECRET) — Rate-Limit ohne Klartext-IPs (DSGVO).
CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_slug     TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','review','rejected')),
  claude_reason TEXT,
  ip_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at   TIMESTAMPTZ
);

CREATE INDEX idx_comments_slug_status ON comments (post_slug, status);
CREATE INDEX idx_comments_ip_created  ON comments (ip_hash, created_at);
