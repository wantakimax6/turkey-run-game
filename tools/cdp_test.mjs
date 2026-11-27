// Headless Chrome driver for Toby's Great Escape (CDP over Node's WebSocket).
//   node tools/cdp_test.mjs shot <title|play|kitchen|escaped> <out.jpg>
//   node tools/cdp_test.mjs autoplay [seed]        (full escape proof)
//   node tools/cdp_test.mjs frames [seed]          (motion sampling)
// Serves game/ on :8901 with python http.server (started by the caller or
// here via --serve). Exits non-zero on page errors or a failed test.
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 9223;
const BASE = 'http://127.0.0.1:8901';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return res.json();
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleLines = [];
    this.errors = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        this.consoleLines.push(text);
        console.log('[page]', text);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const err = msg.params.exceptionDetails?.exception?.description
          || msg.params.exceptionDetails?.text || 'unknown exception';
        this.errors.push(err);
        console.log('[page ERROR]', err);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(r.exceptionDetails)}`);
    return r.result.value;
  }
}

async function launchChrome() {
  // A fresh profile every run: module scripts otherwise come back from the
  // disk cache and a code change silently does not take effect.
  const profile = `/tmp/turkey-chrome-profile-${Date.now()}`;
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--disable-gpu-sandbox',
    `--remote-debugging-port=${PORT}`, '--window-size=1280,800',
    `--user-data-dir=${profile}`, '--mute-audio', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    try {
      const list = await getJson('/json/list');
      if (list.length) return chrome;
    } catch { /* not up yet */ }
  }
  throw new Error('chrome did not start');
}

async function connectPage() {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
  });
  return cdp;
}

async function waitFor(cdp, expr, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await cdp.evaluate(expr)) return true;
    } catch { /* page still loading */ }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function screenshot(cdp, out) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${out}`);
}

async function main() {
  const mode = process.argv[2];
  const chrome = await launchChrome();
  let code = 0;
  try {
    const cdp = await connectPage();
    if (mode === 'shot') {
      const name = process.argv[3];
      const out = process.argv[4];
      await cdp.send('Page.navigate', { url: `${BASE}/index.html?shot=${name}&seed=1` });
      await waitFor(cdp, 'window.__shotReady === true', 120000, '__shotReady');
      // Textures load asynchronously; give the big 4096 px PNGs time to
      // arrive, decode and upload before the screenshot, or textured
      // surfaces render black. (A 9 MiB 4096 px leaf map decodes to 67 MB.)
      await sleep(15000);
      await screenshot(cdp, out);
    } else if (mode === 'autoplay') {
      const seed = process.argv[3] || '1';
      await cdp.send('Page.navigate', { url: `${BASE}/index.html?test=autoplay&seed=${seed}` });
      await waitFor(cdp, 'window.__testResult !== null && window.__testResult !== undefined', 300000, '__testResult');
      const result = await cdp.evaluate('window.__testResult');
      console.log('AUTOPLAY RESULT:', JSON.stringify(result));
      if (result.result !== 'escaped') {
        console.error('AUTOPLAY FAILED: turkey did not escape');
        code = 1;
      }
    } else if (mode === 'frames') {
      const seed = process.argv[3] || '1';
      await cdp.send('Page.navigate', { url: `${BASE}/index.html?test=autoplay&seed=${seed}` });
      const samples = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 240000) {
        const s = await cdp.evaluate(`(() => {
          const g = window.__game;
          if (!g) return null;
          return { t: ${Date.now() - t0}, x: g.player.pos.x, z: g.player.pos.z,
                   stage: g.stageIndex, screen: g.screen, score: g.score, lives: g.lives };
        })()`);
        if (s) samples.push(s);
        if (s && s.screen === 'end') break;
        await sleep(500);
      }
      console.log('FRAMES:', JSON.stringify(samples));
      // Motion check: no teleport between consecutive samples (max 8 m in 0.5 s
      // at dash speed 22 m/s is 11 m; use 12 m), and the run must end escaped.
      let teleports = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const a = samples[i - 1];
        const b = samples[i];
        if (a.stage === b.stage && Math.hypot(b.x - a.x, b.z - a.z) > 12) teleports += 1;
      }
      const last = samples[samples.length - 1];
      console.log(`samples=${samples.length} teleports=${teleports} final=${JSON.stringify(last)}`);
      if (teleports > 0 || !last || last.screen !== 'end') {
        console.error('FRAME CHECK FAILED');
        code = 1;
      }
    }
    if (cdp.errors.length) {
      console.error(`PAGE ERRORS (${cdp.errors.length})`);
      code = 1;
    }
  } catch (err) {
    console.error('DRIVER ERROR:', err.message);
    code = 1;
  } finally {
    chrome.kill('SIGKILL');
  }
  process.exit(code);
}

main();
