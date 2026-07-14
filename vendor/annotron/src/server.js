import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.ANNOTRON_PORT || '7321', 10);
const HOST = process.env.ANNOTRON_HOST || '127.0.0.1';

// --- State ---
const sessions = new Map();   // filePath -> { hash, watchers, sseClients, pollWaiters, agentReplies }
const allowList = new Set();  // registered canonical paths

function getSession(file) {
  if (!sessions.has(file)) {
    sessions.set(file, {
      hash: null,
      sseClients: new Set(),
      pollWaiters: [],
      pendingFeedback: null,
      finalized: false,
      cancelRequested: false,
      working: false,
      remoteApprove: false,          // route permission prompts to the browser
      autoAllowTools: new Set(),      // tools the user chose "allow always" for
      permWaiters: new Map(),         // requestId -> resolve(decisionObj|null)
      pendingPerms: new Map(),        // requestId -> {tool, summary} (for reconnecting clients)
    });
  }
  return sessions.get(file);
}

// --- File watcher ---
const watchIntervals = new Map();

function watchFile(file) {
  if (watchIntervals.has(file)) return;
  let lastHash = hashFile(file);
  const iv = setInterval(() => {
    const h = hashFile(file);
    if (h && h !== lastHash) {
      lastHash = h;
      const sess = sessions.get(file);
      if (!sess) return;
      // Only trigger reload if not a programmatic finalize write
      if (sess._suppressReload) { sess._suppressReload = false; return; }
      broadcastSSE(file, 'reload', '{}');
    }
  }, 800);
  watchIntervals.set(file, iv);
}

function hashFile(file) {
  try {
    const buf = fs.readFileSync(file);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch { return null; }
}

function sidecarPath(file) {
  const ext = path.extname(file);
  return file.slice(0, -ext.length) + '.annotron.json';
}

function readSidecar(file) {
  try {
    const raw = fs.readFileSync(sidecarPath(file), 'utf8');
    return JSON.parse(raw);
  } catch { return { version: 1, annotations: [], rounds: [] }; }
}

function writeSidecar(file, data) {
  fs.writeFileSync(sidecarPath(file), JSON.stringify(data, null, 2), 'utf8');
}

// --- SSE broadcast ---
function broadcastSSE(file, event, data) {
  const sess = sessions.get(file);
  if (!sess) return;
  const msg = `event: ${event}\ndata: ${data}\n\n`;
  for (const res of sess.sseClients) {
    try { res.write(msg); } catch {}
  }
}

// --- Poll wake ---
function wakePoll(file, payload) {
  const sess = sessions.get(file);
  if (!sess) return;
  for (const resolve of sess.pollWaiters) resolve(payload);
  sess.pollWaiters = [];
}

// --- Hook helpers ---
// Correlate an incoming hook event (which only knows cwd) to the annotron
// session it belongs to. Prefer a session that is actively working; if several,
// disambiguate by cwd containment.
function findActiveSession(cwd) {
  const working = [];
  for (const [f, s] of sessions) if (s.working) working.push([f, s]);
  if (working.length === 0) return null;
  if (working.length === 1) return working[0];
  const norm = cwd ? cwd.replace(/\/+$/, '') + '/' : '';
  const match = norm && working.find(([f]) => f.startsWith(norm));
  return match || working[0];
}

// Like findActiveSession but also matches an idle (non-working) session under
// cwd — used for status events (idle/permission notifications) that arrive when
// the agent is between rounds.
function findSessionByCwd(cwd) {
  const active = findActiveSession(cwd);
  if (active) return active;
  const norm = cwd ? cwd.replace(/\/+$/, '') + '/' : '';
  let best = null;
  for (const [f, s] of sessions) {
    if (!norm || f.startsWith(norm)) best = [f, s];
  }
  return best;
}

// Turn a tool call into a short, CLI-like activity line.
function formatActivity(tool, input) {
  input = input || {};
  const base = p => (typeof p === 'string' ? p.split('/').pop() : '');
  const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : '');
  switch (tool) {
    case 'Read': return `Read ${base(input.file_path)}`;
    case 'Edit':
    case 'MultiEdit': return `Edit ${base(input.file_path)}`;
    case 'Write': return `Write ${base(input.file_path)}`;
    case 'NotebookEdit': return `Edit ${base(input.notebook_path || input.file_path)}`;
    case 'Bash': return `Bash: ${clip(input.command, 70)}`;
    case 'Grep': return `Search "${clip(input.pattern, 40)}"`;
    case 'Glob': return `Find ${clip(input.pattern, 40)}`;
    case 'WebFetch': return `Fetch ${clip(input.url, 50)}`;
    case 'WebSearch': return `Web search "${clip(input.query, 40)}"`;
    case 'Task': return `Delegate: ${clip(input.description, 40)}`;
    default: return tool || 'Working…';
  }
}

// Permission-decision JSON the PreToolUse hook echoes back to Claude Code.
function permJSON(decision, reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  });
}

// --- SDK injection ---
const SDK_PATH = path.join(__dirname, 'sdk.js');
const CHROME_PATH = path.join(__dirname, 'chrome.html');
const CHROME_HTML = fs.readFileSync(CHROME_PATH, 'utf8');

function injectSDK(html) {
  const sdkJs = fs.readFileSync(SDK_PATH, 'utf8');
  const tag = `<script data-annotron="1">\n${sdkJs}\n</script>`;
  if (html.includes('</body>')) return html.replace('</body>', tag + '\n</body>');
  return html + '\n' + tag;
}

// --- Request helpers ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function send(res, status, body, ct = 'application/json') {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

// --- Router ---
async function handler(req, res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method.toUpperCase();
  const pathname = u.pathname;

  // CORS preflight
  if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }

  if (pathname === '/health' && method === 'GET') {
    return send(res, 200, { ok: true });
  }

  if (pathname === '/session' && method === 'POST') {
    const { file } = await readBody(req);
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) return send(res, 404, { error: 'file not found' });
    if (!abs.endsWith('.html')) return send(res, 400, { error: 'must be .html' });
    allowList.add(abs);
    getSession(abs);
    watchFile(abs);
    return send(res, 200, { ok: true, file: abs });
  }

  if (pathname === '/' && method === 'GET') {
    const html = fs.readFileSync(CHROME_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  if (pathname === '/sdk.js' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(SDK_PATH, 'utf8'));
    return;
  }

  if (pathname === '/artifact' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    let html;
    try { html = fs.readFileSync(abs, 'utf8'); } catch { return send(res, 404, { error: 'not found' }); }
    const injected = injectSDK(html);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(injected);
    return;
  }

  if (pathname === '/annotations' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    return send(res, 200, readSidecar(abs));
  }

  if (pathname === '/annotations' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const current = readSidecar(abs);
    current.annotations = body.annotations || current.annotations;
    if (body.rounds) current.rounds = body.rounds;
    writeSidecar(abs, current);
    return send(res, 200, { ok: true });
  }

  if (pathname === '/feedback' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // Persist annotations to sidecar
    if (body.items && body.items.length > 0) {
      const sidecar = readSidecar(abs);
      for (const item of body.items) {
        const existing = item.id ? sidecar.annotations.find(a => a.id === item.id) : null;
        if (existing) {
          // Add new message to existing thread
          if (!existing.thread) existing.thread = [];
          if (item.note) existing.thread.push({ role: 'human', message: item.note, timestamp: new Date().toISOString() });
          if (item.kind === 'text') {
            existing.textStart = Number.isInteger(item.textStart) ? item.textStart : existing.textStart ?? null;
            existing.textEnd = Number.isInteger(item.textEnd) ? item.textEnd : existing.textEnd ?? null;
            existing.textPrefix = item.textPrefix || existing.textPrefix || null;
            existing.textSuffix = item.textSuffix || existing.textSuffix || null;
          }
        } else {
          // New annotation
          const ann = {
            id: item.id || ('ann_' + Math.random().toString(36).slice(2, 9)),
            kind: item.kind,
            selector: item.selector || null,
            label: item.label || null,
            text: item.text || null,
            textStart: Number.isInteger(item.textStart) ? item.textStart : null,
            textEnd: Number.isInteger(item.textEnd) ? item.textEnd : null,
            textPrefix: item.textPrefix || null,
            textSuffix: item.textSuffix || null,
            thread: item.note ? [{ role: 'human', message: item.note, timestamp: new Date().toISOString() }] : [],
            createdAt: new Date().toISOString(),
            status: 'open',
          };
          item.id = ann.id;
          sidecar.annotations.push(ann);
        }
      }
      writeSidecar(abs, sidecar);
    }
    const sess = getSession(abs);
    sess.pendingFeedback = body;
    sess.finalized = false;
    sess.cancelRequested = false;
    broadcastSSE(abs, 'agent-thinking', '{}');
    wakePoll(abs, { feedback: body, finalized: false });
    return send(res, 200, { ok: true });
  }

  if (pathname === '/poll' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);

    // If there's already feedback waiting, return it immediately
    if (sess.pendingFeedback) {
      const payload = { feedback: sess.pendingFeedback, finalized: sess.finalized };
      sess.pendingFeedback = null;
      sess.working = true;  // agent is now processing a round
      return send(res, 200, payload);
    }
    if (sess.finalized) {
      sess.finalized = false;
      sess.working = false;
      return send(res, 200, { finalized: true });
    }

    // Long-poll
    const timeout = setTimeout(() => {
      sess.pollWaiters = sess.pollWaiters.filter(r => r !== resolve);
      send(res, 200, { feedback: null, finalized: false });
    }, 25000);

    let resolve;
    const p = new Promise(r => { resolve = r; });
    sess.pollWaiters.push(resolve);
    const payload = await p;
    clearTimeout(timeout);
    sess.pendingFeedback = null;
    if (payload && payload.feedback) sess.working = true;   // handed a new round to the agent
    else if (payload && payload.finalized) sess.working = false;
    return send(res, 200, payload);
  }

  if (pathname === '/finalize' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.html) return send(res, 400, { error: 'missing file or html' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    sess._suppressReload = true;
    fs.writeFileSync(abs, body.html, 'utf8');
    sess.finalized = true;
    wakePoll(abs, { finalized: true });
    return send(res, 200, { ok: true });
  }

  if (pathname === '/agent-reply' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.message) return send(res, 400, { error: 'missing file or message' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    // Agent is reporting back → the round is done, it's no longer actively working
    getSession(abs).working = false;
    // Persist reply into sidecar thread if annotationId given
    if (body.annotationId) {
      const sidecar = readSidecar(abs);
      const ann = sidecar.annotations.find(a => a.id === body.annotationId);
      if (ann) {
        if (!ann.thread) ann.thread = [];
        ann.thread.push({ role: 'agent', message: body.message, timestamp: new Date().toISOString() });
        writeSidecar(abs, sidecar);
      }
    }
    broadcastSSE(abs, 'agent-reply', JSON.stringify({ message: body.message, annotationId: body.annotationId || null }));
    return send(res, 200, { ok: true });
  }

  if (pathname === '/upload' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file || !body.dataUrl) return send(res, 400, { error: 'missing file or dataUrl' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(body.dataUrl);
    if (!m) return send(res, 400, { error: 'invalid image data' });
    const mime = m[1];
    let buf;
    try { buf = Buffer.from(m[2], 'base64'); } catch { return send(res, 400, { error: 'invalid base64' }); }
    const MAX = 20 * 1024 * 1024;
    if (buf.length > MAX) return send(res, 413, { error: 'image too large (max 20MB)' });
    const extByMime = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
    const ext = extByMime[mime] || 'png';
    const dir = path.join(path.dirname(abs), '.annotron-uploads');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const rawName = (body.name || 'image').replace(/\.[^.]*$/, '');
    const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'image';
    const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeBase}.${ext}`;
    const dest = path.join(dir, fname);
    try { fs.writeFileSync(dest, buf); } catch (e) { return send(res, 500, { error: 'write failed: ' + e.message }); }
    return send(res, 200, { ok: true, path: dest, name: body.name || fname });
  }

  if (pathname === '/agent-progress' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    broadcastSSE(abs, 'agent-progress', JSON.stringify({ step: body.step || '', done: !!body.done }));
    return send(res, 200, { ok: true });
  }

  if (pathname === '/cancel' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    sess.cancelRequested = true;
    broadcastSSE(abs, 'agent-cancelled', '{}');
    return send(res, 200, { ok: true });
  }

  if (pathname === '/cancelled' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    return send(res, 200, { cancelled: !!sess.cancelRequested });
  }

  // Fileless check used by the `annotron check` CLI fallback: is any in-flight
  // (actively-working) session currently under a cancel request?
  if (pathname === '/cancel-check' && method === 'GET') {
    for (const [f, s] of sessions) {
      if (s.working && s.cancelRequested) return send(res, 200, { cancelled: true, file: f });
    }
    return send(res, 200, { cancelled: false });
  }

  // ── Hook ingest (Claude Code hooks POST their raw stdin JSON here) ──────────
  // PreToolUse: mirror the activity, enforce cancel, and (if remote-approve is
  // on) gate the tool on a browser Allow/Deny. Returns the exact JSON the hook
  // echoes back to Claude Code, or an empty body meaning "defer to normal flow".
  if (pathname === '/hook/pretool' && method === 'POST') {
    const body = await readBody(req);
    const tool = body.tool_name || body.tool || '';
    const input = body.tool_input || body.input || {};
    // Never gate/mirror annotron's OWN CLI calls — the agent must be able to
    // reply/poll/check even while cancelled or while remote-approve is on
    // (gating them would deadlock the poll). Detect the real command string
    // here (server-side JSON parse) rather than fuzzy-matching raw stdin.
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (tool === 'Bash' && /annotron["']?\s+(poll|progress|check|stop|help)\b/.test(cmd)) {
      return send(res, 200, '');
    }
    const found = findActiveSession(body.cwd);
    if (!found) return send(res, 200, '');       // no active review → normal flow
    const [file, sess] = found;
    broadcastSSE(file, 'agent-progress', JSON.stringify({ step: formatActivity(tool, input) }));

    if (sess.cancelRequested) {
      return send(res, 200, permJSON('deny',
        'annotron: the user cancelled the current review. Stop immediately — do not run further tools. Reply on the artifact (annotron poll <file> --reply "Stopped — cancelled by user.") then wait for new feedback.'));
    }
    if (!sess.remoteApprove) return send(res, 200, '');
    if (sess.autoAllowTools.has(tool)) return send(res, 200, permJSON('allow'));

    const requestId = 'perm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const summary = formatActivity(tool, input);
    sess.pendingPerms.set(requestId, { tool, summary });
    broadcastSSE(file, 'permission-request', JSON.stringify({ requestId, tool, summary }));
    const decision = await new Promise(resolve => {
      sess.permWaiters.set(requestId, resolve);
      setTimeout(() => {
        if (sess.permWaiters.has(requestId)) { sess.permWaiters.delete(requestId); resolve(null); }
      }, 170000);
    });
    sess.pendingPerms.delete(requestId);
    broadcastSSE(file, 'permission-resolved', JSON.stringify({ requestId }));
    if (!decision) {
      return send(res, 200, permJSON('ask',
        'annotron: no response from the review UI in time — falling back to the terminal prompt.'));
    }
    if (decision.decision === 'allow' && decision.always) sess.autoAllowTools.add(tool);
    if (decision.decision === 'deny') {
      return send(res, 200, permJSON('deny', decision.reason || 'Denied by the reviewer in annotron.'));
    }
    return send(res, 200, permJSON('allow'));
  }

  // PostToolUse: mark the current activity step done.
  if (pathname === '/hook/posttool' && method === 'POST') {
    const body = await readBody(req);
    const found = findActiveSession(body.cwd);
    if (found) broadcastSSE(found[0], 'agent-progress-done', JSON.stringify({ tool: body.tool_name || '' }));
    return send(res, 200, { ok: true });
  }

  // Notification: reflect "waiting for permission / idle" in the browser.
  if (pathname === '/hook/notify' && method === 'POST') {
    const body = await readBody(req);
    const found = findSessionByCwd(body.cwd);
    const type = body.notification_type || body.type || '';
    if (found) broadcastSSE(found[0], 'agent-status', JSON.stringify({ type }));
    return send(res, 200, { ok: true });
  }

  // Stop: the turn finished → agent is idle, waiting for the next feedback.
  if (pathname === '/hook/stop' && method === 'POST') {
    const body = await readBody(req);
    const found = findSessionByCwd(body.cwd);
    if (found) broadcastSSE(found[0], 'agent-status', JSON.stringify({ type: 'idle' }));
    return send(res, 200, { ok: true });
  }

  // ── Remote permission control (from the browser) ────────────────────────────
  if (pathname === '/permission/decision' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    const resolve = sess.permWaiters.get(body.requestId);
    if (resolve) {
      sess.permWaiters.delete(body.requestId);
      resolve({
        decision: body.decision === 'deny' ? 'deny' : 'allow',
        always: !!body.always,
        reason: body.reason || '',
      });
    }
    return send(res, 200, { ok: true });
  }

  if (pathname === '/permission/mode' && method === 'POST') {
    const body = await readBody(req);
    const file = body.file;
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    if (!allowList.has(abs)) return send(res, 403, { error: 'not registered' });
    const sess = getSession(abs);
    sess.remoteApprove = !!body.enabled;
    if (!sess.remoteApprove) {
      // Turning off: release anything currently waiting so nothing hangs.
      for (const resolve of sess.permWaiters.values()) resolve(null);
      sess.permWaiters.clear();
      sess.pendingPerms.clear();
    }
    if (body.clearAutoAllow) sess.autoAllowTools.clear();
    broadcastSSE(abs, 'permission-mode', JSON.stringify({ enabled: sess.remoteApprove }));
    return send(res, 200, { ok: true, enabled: sess.remoteApprove });
  }

  if (pathname === '/events' && method === 'GET') {
    const file = u.searchParams.get('file');
    if (!file) return send(res, 400, { error: 'missing file' });
    const abs = path.resolve(file);
    // Allow events even if not in allowList (browser may connect before register)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    const sess = getSession(abs);
    sess.sseClients.add(res);
    req.on('close', () => { sess.sseClients.delete(res); });
    // Keep-alive ping
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(ping); } }, 20000);
    req.on('close', () => clearInterval(ping));
    return;
  }

  if (pathname === '/stop' && method === 'POST') {
    send(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 100);
    return;
  }

  send(res, 404, { error: 'not found' });
}

const server = http.createServer(handler);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Another server already owns the port — exit quietly
    process.exit(0);
  }
  console.error('[annotron server]', err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`annotron server listening on http://${HOST}:${PORT}`);
});
