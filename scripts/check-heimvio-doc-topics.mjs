#!/usr/bin/env node
/**
 * check-heimvio-doc-topics — die Doku entfernt kein Ziel, auf das die heimvio-SPA zeigt.
 *
 * Die SPA verlinkt in die Doku nur ueber DOC_TOPICS
 * (heimvio: projects/app/src/app/core/docs/doc-topics.ts, je Zeile
 * 'schluessel': '<slug>' bzw. '<slug>#<anker>', '' = Doku-Startseite). Im
 * heimvio-Repo prueft lint:doc-links, dass jeder Eintrag ein Ziel hat — aber nur,
 * wenn dort gepusht wird. Benennt jemand HIER eine Seite um oder formuliert eine
 * Ueberschrift neu, zeigen die Info-Knoepfe der laufenden SPA ab dem naechsten
 * Doku-Deploy ins Leere. Dieser Lauf steht deshalb im Deploy-Workflow NACH dem
 * Build und VOR dem Ausliefern und liest die frisch gebaute dist/doku/anchors.json
 * (src/pages/doku/anchors.json.ts).
 *
 * Woher DOC_TOPICS kommt (erste Quelle, die greift):
 *   1. HEIMVIO_DOC_TOPICS_FILE — lokale Datei
 *   2. Gitea-API: Datei auf dem main-Branch von heimvio/heimvio, Token aus
 *      HEIMVIO_REPO_TOKEN (Lesezugriff auf heimvio/heimvio; in der CI das
 *      Secret GITEAREADTOKEN). Host: GITEA_HOST, sonst $GITHUB_SERVER_URL,
 *      sonst https://git.ohnewarum.de; Repo HEIMVIO_REPO (heimvio/heimvio),
 *      Branch HEIMVIO_REF (main).
 *   3. lokal: der heimvio-Checkout neben diesem (<eltern>/<name ohne -blog>).
 * Ohne Quelle: lokal Warnung und Exit 0, mit CI=true Exit 1.
 * Liegt die Datei auf main noch nicht (404), gibt es nichts zu schuetzen: Exit 0.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REG_PATH = 'projects/app/src/app/core/docs/doc-topics.ts';
const ANCHORS = join(ROOT, 'dist/doku/anchors.json');
const IN_CI = process.env.CI === 'true';

function giveUp(msg) {
  if (IN_CI) {
    console.error(`check-heimvio-doc-topics: ${msg}`);
    process.exit(1);
  }
  console.warn(`check-heimvio-doc-topics — UEBERSPRUNGEN (nur lokal erlaubt): ${msg}`);
  process.exit(0);
}

async function loadRegistry() {
  const file = process.env.HEIMVIO_DOC_TOPICS_FILE;
  if (file) {
    if (!existsSync(file)) giveUp(`HEIMVIO_DOC_TOPICS_FILE=${file} gibt es nicht`);
    return { text: readFileSync(file, 'utf8'), source: file };
  }
  const token = process.env.HEIMVIO_REPO_TOKEN;
  if (token) {
    const host = (process.env.GITEA_HOST || process.env.GITHUB_SERVER_URL || 'https://git.ohnewarum.de').replace(/\/+$/, '');
    const repo = process.env.HEIMVIO_REPO || 'heimvio/heimvio';
    const ref = process.env.HEIMVIO_REF || 'main';
    const url = `${host}/api/v1/repos/${repo}/raw/${REG_PATH}?ref=${encodeURIComponent(ref)}`;
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `token ${token}` } });
    } catch (e) {
      giveUp(`${host} nicht erreichbar (${e.cause?.code ?? e.message})`);
    }
    if (res.status === 404) {
      // Repo nicht lesbar ODER Datei (noch) nicht auf dem Branch — Gitea
      // unterscheidet das hier nicht. Das Repo selbst pruefen:
      const probe = await fetch(`${host}/api/v1/repos/${repo}`, { headers: { Authorization: `token ${token}` } });
      if (!probe.ok) giveUp(`${repo} mit HEIMVIO_REPO_TOKEN nicht lesbar (${probe.status}) — Token ohne Lesezugriff?`);
      console.log(`check-heimvio-doc-topics — ${REG_PATH} liegt auf ${repo}@${ref} noch nicht, nichts zu pruefen.`);
      process.exit(0);
    }
    if (!res.ok) giveUp(`${url} antwortet ${res.status}`);
    return { text: await res.text(), source: `${repo}@${ref}` };
  }
  const sibling = join(dirname(ROOT), basename(ROOT).replace(/-blog$/, ''), REG_PATH);
  if (basename(ROOT).endsWith('-blog') && existsSync(sibling)) {
    return { text: readFileSync(sibling, 'utf8'), source: sibling };
  }
  giveUp('weder HEIMVIO_DOC_TOPICS_FILE noch HEIMVIO_REPO_TOKEN gesetzt, kein heimvio-Checkout daneben');
}

if (!existsSync(ANCHORS)) giveUp('dist/doku/anchors.json fehlt — vorher npm run build');
const { pages } = JSON.parse(readFileSync(ANCHORS, 'utf8'));

const { text, source } = await loadRegistry();
const block = /export const DOC_TOPICS\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(text);
if (!block) {
  console.error(`check-heimvio-doc-topics: in ${source} kein \`export const DOC_TOPICS = { … } as const\``);
  process.exit(1);
}
const topics = [...block[1].matchAll(/^\s*'([^']+)'\s*:\s*'([^']*)'\s*,?\s*$/gm)].map((m) => ({ key: m[1], value: m[2] }));

const errors = [];
for (const { key, value } of topics) {
  if (value === '') continue;
  const hash = value.indexOf('#');
  const slug = (hash < 0 ? value : value.slice(0, hash)).replace(/^\/+|\/+$/g, '');
  const anchor = hash < 0 ? '' : decodeURIComponent(value.slice(hash + 1));
  if (!(slug in pages)) {
    errors.push(`  '${key}': '${value}' — Seite „${slug}“ gibt es in diesem Build nicht (doku/${slug}.mdx)`);
  } else if (anchor && !pages[slug].includes(anchor)) {
    errors.push(`  '${key}': '${value}' — auf „${slug}“ gibt es keine Ueberschrift mit dem Anker „#${anchor}“`);
  }
}

if (errors.length) {
  console.error(`check-heimvio-doc-topics: ${errors.length} Doku-Link(s) der heimvio-SPA haetten nach diesem Deploy kein Ziel (Liste: ${source})\n`);
  for (const e of errors) console.error(e);
  console.error(
    `\nDie Seite bzw. Ueberschrift wieder herstellen (der Anker ist die Id, die Astro`
    + `\naus der Ueberschrift bildet — siehe dist/doku/anchors.json), ODER zuerst im`
    + `\nheimvio-Repo ${REG_PATH} auf das neue Ziel umstellen und ausliefern.`,
  );
  process.exit(1);
}
console.log(`check-heimvio-doc-topics ok (${topics.length} Doku-Links der SPA, alle mit Ziel; Liste: ${source})`);
