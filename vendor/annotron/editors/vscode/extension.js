// annotron VS Code extension.
//
// Thin wrapper: right-click a .md/.html file → start the bundled annotron server
// (spawned with VS Code's own Node via ELECTRON_RUN_AS_NODE, so no global install
// is required) → register the file → open the review editor in the browser (or a
// VS Code Simple Browser tab). annotron itself does the rendering (Markdown +
// merslim diagrams), annotation, and feedback loop.

const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let context;
let serverProc = null;
const agents = new Map(); // file -> Terminal running `annotron agent`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Start (or focus) an auto-apply agent for `file` in a visible terminal. The
// agent watches for feedback and applies it with Claude Code, so the reviewer
// doesn't have to run anything by hand.
function startAgent(file, port) {
  const existing = agents.get(file);
  // Reuse a live agent terminal; replace one whose process already exited (e.g.
  // after the browser's "Done"), so re-opening always yields a working agent.
  if (existing && existing.exitStatus === undefined) { existing.show(false); return; }
  if (existing) { try { existing.dispose(); } catch (_) {} agents.delete(file); }
  const binPath = context.asAbsolutePath(path.join('vendor', 'annotron', 'bin', 'annotron'));
  const term = vscode.window.createTerminal({ name: 'annotron agent' });
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
  // Trailing `; exit` closes the terminal once the agent process ends — the
  // browser's "Done" makes the agent stop, so no dead tab is left behind.
  term.sendText(`ELECTRON_RUN_AS_NODE=1 ANNOTRON_PORT=${port} ${q(process.execPath)} ${q(binPath)} agent ${q(file)}; exit`);
  term.show(false);
  agents.set(file, term);
}

function health(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 800 }, (r) => {
      r.resume();
      resolve(r.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function postJSON(port, p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode, body: d })); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function ensureServer(port) {
  if (await health(port)) return;
  const serverPath = context.asAbsolutePath(path.join('vendor', 'annotron', 'src', 'server.js'));
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', ANNOTRON_PORT: String(port), ANNOTRON_HOST: '127.0.0.1' };
  serverProc = spawn(process.execPath, [serverPath], { env, detached: true, stdio: 'ignore' });
  serverProc.on('error', () => {});
  serverProc.unref();
  for (let i = 0; i < 30; i++) { await sleep(200); if (await health(port)) return; }
  throw new Error('the bundled server did not start');
}

async function openFile(uri) {
  const fileUri = uri && uri.fsPath ? uri : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri;
  if (!fileUri || fileUri.scheme !== 'file') {
    vscode.window.showWarningMessage('annotron: open (or right-click) a local .md or .html file.');
    return;
  }
  const file = fileUri.fsPath;
  if (!/\.(md|markdown|html?)$/i.test(file)) {
    vscode.window.showWarningMessage('annotron supports .md and .html files.');
    return;
  }
  const cfg = vscode.workspace.getConfiguration('annotron');
  const port = cfg.get('port', 7321);
  const openIn = cfg.get('openIn', 'browser');
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'annotron: opening…' },
      async () => {
        await ensureServer(port);
        const r = await postJSON(port, '/session', { file });
        if (r.status !== 200) {
          let msg = 'could not register the file';
          try { msg = JSON.parse(r.body).error || msg; } catch (_) {}
          throw new Error(msg);
        }
        const url = `http://127.0.0.1:${port}/?file=${encodeURIComponent(file)}`;
        if (openIn === 'vscode') {
          await vscode.commands.executeCommand('simpleBrowser.show', url);
        } else {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        // Auto-start the feedback agent so comments get applied without any
        // manual polling (annotron.autoAgent).
        if (cfg.get('autoAgent', true)) {
          try { startAgent(file, port); } catch (_) {}
        }
      }
    );
  } catch (e) {
    vscode.window.showErrorMessage('annotron: ' + (e && e.message ? e.message : String(e)));
  }
}

async function stopServer() {
  const port = vscode.workspace.getConfiguration('annotron').get('port', 7321);
  try { await postJSON(port, '/stop', {}); vscode.window.showInformationMessage('annotron server stopped.'); }
  catch (_) { vscode.window.showInformationMessage('annotron server is not running.'); }
}

function activate(ctx) {
  context = ctx;
  ctx.subscriptions.push(vscode.commands.registerCommand('annotron.open', openFile));
  ctx.subscriptions.push(vscode.commands.registerCommand('annotron.stop', stopServer));
  // Forget an agent when its terminal is closed, so it can be restarted.
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal((t) => {
    for (const [f, term] of agents) if (term === t) agents.delete(f);
  }));
}

// Leave the server running as a background daemon between windows; the user can
// stop it explicitly with the "Stop annotron server" command.
function deactivate() {}

module.exports = { activate, deactivate };
