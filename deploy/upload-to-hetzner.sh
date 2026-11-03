#!/usr/bin/env bash
# Liefert die gebaute Astro-Site und die Kommentar-API auf heimvio.de aus.
# Laeuft im Job-Container des Gitea-Runners (Label ubuntu-latest, LXC
# heimvio-runner-fast) — der Runner steht NICHT mehr auf dem Zielhost, deshalb
# geht alles ueber ssh/tar. Vorbild: heimvio-Repo scripts/upload-to-hetzner.sh.
#
# Erwartet: dist/ ist gebaut, HETZNER_SSH_KEY gesetzt (base64, einzeilig).

set -euo pipefail

HOST="${DEPLOY_HOST:-root@heimvio.de}"
WEBROOT="${DEPLOY_WEBROOT:-/var/www/heimvio-content}"
# Besitzer des Webroots auf dem Host: Caddy mountet nur lesend, aber die
# Ordnerrechte sollen nicht bei jedem Deploy auf root umspringen.
WEBROOT_OWNER="${DEPLOY_WEBROOT_OWNER:-act-runner:act-runner}"
WORK=/tmp/heimvio-blog-deploy

[ -f dist/blog/index.html ] || { echo "FEHLER: dist/blog/index.html fehlt — wurde 'npm run build' ausgefuehrt?" >&2; exit 1; }
[ -n "${HETZNER_SSH_KEY:-}" ] || { echo "FEHLER: HETZNER_SSH_KEY nicht gesetzt" >&2; exit 1; }

# Key aus dem Secret. base64 einzeilig, weil Gitea mehrzeilige Secrets im
# Workflow-Log nicht maskiert (Vorfall 2026-09-16 im heimvio-Repo).
KEY="$(mktemp)"
trap 'rm -f "$KEY"' EXIT
printf '%s' "$HETZNER_SSH_KEY" | base64 -d 2>/dev/null > "$KEY" \
  || printf '%s' "$HETZNER_SSH_KEY" | base64 -D > "$KEY"
chmod 600 "$KEY"
# accept-new: der Job-Container startet jedes Mal ohne known_hosts.
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -i $KEY"

command -v ssh >/dev/null || { apt-get update -qq && apt-get install -y -qq openssh-client; }

# dist/ ist der Content-Root, api/ und deploy/ braucht der Image-Bau auf dem
# Host (compose build: ../api). node_modules und api/dist bleiben draussen —
# das Image baut selbst.
echo "Uebertrage Site und API-Quellen nach $HOST ..."
tar -cz --exclude='node_modules' --exclude='api/dist' dist deploy api \
  | ssh $SSH_OPTS "$HOST" "
      set -eu
      rm -rf '$WORK' && mkdir -p '$WORK'
      tar -xz -C '$WORK'
    "

echo "Veroeffentliche die statische Site ..."
# --delete ist richtig: dist/ IST der Content-Root, entfernte Seiten sollen weg.
# AUSSER /doku/: die Benutzerdoku liefert seit Plan #119 das heimvio-Repo
# (deploy-package.sh) in dasselbe Verzeichnis — ohne --exclude loeschte jeder
# Blog-Deploy die Doku. Ausgeschlossene Pfade fasst --delete nicht an.
# --delay-updates schaltet erst um, wenn alles uebertragen ist.
ssh $SSH_OPTS "$HOST" "
  set -eu
  rsync -a --delete --exclude=/doku/ --delay-updates --chown='$WEBROOT_OWNER' '$WORK/dist/' '$WEBROOT/'
"

echo "Baue und rolle die Kommentar-API ..."
ssh $SSH_OPTS "$HOST" "
  set -eu
  cd '$WORK'
  docker compose -f deploy/docker-compose.blog.yml build blog-api
  docker compose -f deploy/docker-compose.blog.yml up -d blog-api
  rm -rf '$WORK'
"

echo "Auslieferung abgeschlossen."
