import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as chromeLauncher from 'chrome-launcher';

const PORT = Number(process.env.ANIMATION_AUDIT_PORT || 4282);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !reqPath.includes('.')) reqPath = '/index.html';
  let filePath = path.join(DIST_DIR, reqPath);
  if (!fs.existsSync(filePath)) filePath = path.join(DIST_DIR, 'index.html');
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200);
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

async function test() {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const chromeOptions = {
    chromeFlags: ['--headless=new', '--no-sandbox'],
  };
  if (process.env.CHROME_PATH) chromeOptions.chromePath = process.env.CHROME_PATH;
  const chrome = await chromeLauncher.launch(chromeOptions);

  const res = await fetch(`http://127.0.0.1:${chrome.port}/json`);
  const data = await res.json();
  const ws = new WebSocket(data[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const msgId = id++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === msgId) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  });

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await new Promise(r => setTimeout(r, 3000));

  const anims = await send('Runtime.evaluate', {
    expression: `(() => {
      const allAnims = document.getAnimations();
      return allAnims.map(a => {
        const el = a.effect?.target;
        return {
          selector: el ? (el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : '')) : 'unknown',
          type: a.constructor.name,
          name: a.animationName || a.transitionProperty,
          duration: a.effect?.getTiming()?.duration,
          keyframes: a.effect?.getKeyframes()
        };
      });
    })()`,
    returnByValue: true
  });

  console.log(`Active animations count: ${anims?.result?.value?.length}`);
  console.log('Sample animations:', JSON.stringify(anims?.result?.value?.slice(0, 15), null, 2));

  await chrome.kill();
  server.close();
}

test().catch(console.error);
