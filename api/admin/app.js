// Review-UI: OIDC Authorization Code + PKCE (public client) gegen Zitadel,
// Token im sessionStorage; Queue + approve/reject gegen /admin/api/* (Bearer).
const cfg = window.BLOG_ADMIN_CONFIG || {};
const REDIRECT_URI = `${location.origin}/admin/`;
const SCOPE = 'openid profile email';

const $ = (id) => document.getElementById(id);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };

// --- PKCE-Helfer --------------------------------------------------------------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = () => b64url(crypto.getRandomValues(new Uint8Array(48)));
const sha256 = async (s) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

async function discovery() {
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`);
  return res.json();
}

async function startLogin() {
  const doc = await discovery();
  const verifier = randomString();
  const state = randomString();
  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('pkce_state', state);
  const url = new URL(doc.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: cfg.clientId, response_type: 'code', redirect_uri: REDIRECT_URI,
    scope: SCOPE, state, code_challenge: await sha256(verifier), code_challenge_method: 'S256',
  });
  location.assign(url);
}

async function finishLogin(code) {
  const doc = await discovery();
  const res = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
      client_id: cfg.clientId, code_verifier: sessionStorage.getItem('pkce_verifier') || '',
    }),
  });
  if (!res.ok) throw new Error('token_exchange_failed');
  const tok = await res.json();
  sessionStorage.setItem('access_token', tok.access_token);
  history.replaceState(null, '', REDIRECT_URI);
}

// --- API ----------------------------------------------------------------------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${sessionStorage.getItem('access_token') || ''}` },
  });
  if (res.status === 401 || res.status === 403) { sessionStorage.removeItem('access_token'); showLogin(); throw new Error('auth'); }
  if (!res.ok) throw new Error(`api ${res.status}`);
  return res.json();
}

async function loadQueue() {
  const status = $('status').value;
  const items = await api(`/admin/api/comments?status=${encodeURIComponent(status)}`);
  $('count').textContent = `${items.length} Einträge`;
  $('empty').hidden = items.length > 0;
  $('list').innerHTML = items.map((c) => `
    <li data-id="${c.id}">
      <p class="head"><strong>${esc(c.author_name)}</strong>
        <a class="slug" href="/blog/${esc(c.post_slug)}" target="_blank" rel="noopener">${esc(c.post_slug)}</a>
        <time>${new Date(c.created_at).toLocaleString('de-DE')}</time></p>
      ${c.claude_reason ? `<p class="reason">KI: ${esc(c.claude_reason)}</p>` : ''}
      <p class="content">${esc(c.content)}</p>
      <div class="acts">
        <button class="approve" data-act="approve">Freigeben</button>
        <button class="reject" data-act="reject">Ablehnen</button>
      </div>
    </li>`).join('');
}

async function loadStats() {
  const rows = await api('/admin/api/stats');
  const tbody = document.querySelector('#stats tbody');
  $('stats-empty').hidden = rows.length > 0;
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td style="padding:.35rem"><a class="slug" href="/blog/${esc(r.post_slug)}" target="_blank" rel="noopener">${esc(r.post_slug)}</a></td>
      <td style="text-align:right;padding:.35rem">${r.views_total}</td>
      <td style="text-align:right;padding:.35rem">${r.views_30d}</td>
      <td style="text-align:right;padding:.35rem">${r.up}</td>
      <td style="text-align:right;padding:.35rem">${r.down}</td>
      <td style="text-align:right;padding:.35rem">${r.comments}</td>
    </tr>`).join('');
}

function showLogin() { $('login').hidden = false; $('app').hidden = true; }
function showApp() {
  $('login').hidden = true; $('app').hidden = false;
  loadQueue().catch(console.error);
  loadStats().catch(console.error);
}

// --- Events -------------------------------------------------------------------
$('login-btn').addEventListener('click', () => startLogin().catch(console.error));
$('reload').addEventListener('click', () => loadQueue().catch(console.error));
$('status').addEventListener('change', () => loadQueue().catch(console.error));
$('list').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('li').dataset.id;
  await api(`/admin/api/comments/${id}/${btn.dataset.act}`, { method: 'POST' });
  loadQueue().catch(console.error);
});

// --- Boot ---------------------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.get('code')) {
  finishLogin(params.get('code')).then(showApp).catch((e) => { console.error(e); showLogin(); });
} else if (sessionStorage.getItem('access_token')) {
  showApp();
} else {
  showLogin();
}
