-- Aufrufzähler je Post und Tag — reines Aggregat (keine IPs, keine Cookies,
-- kein Fingerprinting → datenschutzrechtlich unkritisch, kein Consent nötig).
CREATE TABLE page_views (
  post_slug TEXT NOT NULL,
  day       DATE NOT NULL DEFAULT current_date,
  views     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_slug, day)
);
