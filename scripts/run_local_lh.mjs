import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const PORT = Number(process.env.LIGHTHOUSE_PORT || 4280);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const REPORT_FILE = process.env.LIGHTHOUSE_REPORT_FILE
  ? path.resolve(process.env.LIGHTHOUSE_REPORT_FILE)
  : path.join(os.tmpdir(), `vibetogether-lighthouse-${Date.now()}.json`);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !reqPath.includes('.')) {
    reqPath = '/index.html';
  }
  let filePath = path.join(DIST_DIR, reqPath);
  if (!fs.existsSync(filePath) && filePath.includes('/assets/folder/')) {
    filePath = path.join(ROOT_DIR, 'public', reqPath);
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not Found');
  }
});

async function main() {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`Server listening at http://127.0.0.1:${PORT}`);

  const chromeOptions = {
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  };
  if (process.env.CHROME_PATH) chromeOptions.chromePath = process.env.CHROME_PATH;
  const chrome = await chromeLauncher.launch(chromeOptions);
  console.log(`Chrome launched on port ${chrome.port}`);

  try {
    console.log('Running Lighthouse Mobile Audit on http://127.0.0.1:' + PORT + '...');
    const runnerResult = await lighthouse(`http://127.0.0.1:${PORT}`, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        disabled: false,
      },
      throttlingMethod: 'simulate',
    });

    const lhr = runnerResult.lhr;
    fs.writeFileSync(REPORT_FILE, JSON.stringify(lhr, null, 2));
    console.log(`Report written to ${REPORT_FILE}`);

    const cats = lhr.categories;
    const audits = lhr.audits;

    console.log('======================================================');
    console.log('LIGHTHOUSE MOBILE AUDIT RESULTS:');
    console.log(`Performance: ${Math.round((cats.performance?.score || 0) * 100)}`);
    console.log(`Accessibility: ${Math.round((cats.accessibility?.score || 0) * 100)}`);
    console.log(`Best Practices: ${Math.round((cats['best-practices']?.score || 0) * 100)}`);
    console.log(`SEO: ${Math.round((cats.seo?.score || 0) * 100)}`);
    console.log('------------------------------------------------------');
    console.log(`FCP: ${audits['first-contentful-paint']?.displayValue} (${audits['first-contentful-paint']?.numericValue?.toFixed(0)} ms)`);
    console.log(`LCP: ${audits['largest-contentful-paint']?.displayValue} (${audits['largest-contentful-paint']?.numericValue?.toFixed(0)} ms)`);
    console.log(`TBT: ${audits['total-blocking-time']?.displayValue} (${audits['total-blocking-time']?.numericValue?.toFixed(0)} ms)`);
    console.log(`CLS: ${audits['cumulative-layout-shift']?.displayValue} (${audits['cumulative-layout-shift']?.numericValue?.toFixed(3)})`);
    console.log(`Speed Index: ${audits['speed-index']?.displayValue} (${audits['speed-index']?.numericValue?.toFixed(0)} ms)`);
    console.log('======================================================');

    console.log('\n--- 1. EXACT LCP ELEMENT ---');
    const lcpElem = audits['largest-contentful-paint-element'];
    console.log(JSON.stringify(lcpElem?.details?.items, null, 2));

    console.log('\n--- 2. RENDER-BLOCKING RESOURCES ---');
    const rb = audits['render-blocking-resources'];
    console.log(`Potential Savings: ${rb?.displayValue || 'None'}`);
    console.log(JSON.stringify(rb?.details?.items, null, 2));

    console.log('\n--- 3. UNUSED JAVASCRIPT ---');
    const ujs = audits['unused-javascript'];
    console.log(`Potential Savings: ${ujs?.displayValue || 'None'}`);
    console.log(JSON.stringify(ujs?.details?.items, null, 2));

    console.log('\n--- 4. IMAGE DELIVERY OPPORTUNITIES ---');
    ['modern-image-formats', 'uses-optimized-images', 'uses-responsive-images', 'oversized-images'].forEach(key => {
      const a = audits[key];
      if (a && a.details?.items?.length) {
        console.log(`\nAudit [${key}]: ${a.displayValue || ''}`);
        console.log(JSON.stringify(a.details.items, null, 2));
      }
    });

    console.log('\n--- 5. NON-COMPOSITED ANIMATIONS ---');
    const anim = audits['non-composited-animations'];
    console.log(`Elements with non-composited animations: ${anim?.details?.items?.length || 0}`);
    console.log(JSON.stringify(anim?.details?.items, null, 2));

    console.log('\n--- 6. MAIN THREAD TASKS & LONG WORK ---');
    const longTasks = audits['long-tasks'];
    console.log('Long Tasks:', JSON.stringify(longTasks?.details?.items, null, 2));
    const mt = audits['mainthread-work-breakdown'];
    console.log('Main Thread Work Breakdown:', JSON.stringify(mt?.details?.items?.slice(0, 8), null, 2));

  } catch (err) {
    console.error('Audit run error:', err);
  } finally {
    await chrome.kill();
    server.close();
  }
}

main().catch(console.error);
