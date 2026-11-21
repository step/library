// Renders index.html to MP4, frame by frame, in headless Chrome.
// Needs playwright and ffmpeg-static installed somewhere outside the app (they are not app dependencies):
//   npm i playwright ffmpeg-static && node render.mjs "$PWD/index.html" out.mp4 30
// The narration is added afterwards with ffmpeg; clip timings are in narration.tsv.

// Usage: node render.mjs <index.html> <out.mp4> [fps] | node render.mjs <index.html> --stills <dir> t1,t2,...
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ffmpeg = require('ffmpeg-static');

const [html, out, arg3, arg4] = process.argv.slice(2);
// PORTRAIT=1 renders the 9:16 phone cut (index.html?portrait) at 1080x1920.
const portrait = process.env.PORTRAIT === '1';
const [W, H] = portrait ? [1080, 1920] : [1920, 1080];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(html).href + '?export=1' + (portrait ? '&portrait=1' : ''));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

if (out === '--stills') {
  mkdirSync(arg3, { recursive: true });
  for (const s of arg4.split(',')) {
    await page.evaluate((x) => window.__seek(x), Number(s));
    await page.screenshot({ path: `${arg3}/t${s}.png` });
  }
} else {
  const fps = Number(arg3 || 30);
  const duration = await page.evaluate(() => window.__duration);
  const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(duration * fps);
  for (let i = 0; i <= total; i++) {
    await page.evaluate((x) => window.__seek(x), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
await browser.close();
