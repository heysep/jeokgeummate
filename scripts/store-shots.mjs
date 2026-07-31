import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const PORT = 4730;
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync('store-assets', { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickTab = (page, name) => page.evaluate((n) => {
  [...document.querySelectorAll('.tab')].find((t) => t.innerText.trim() === n)?.click();
}, name);
// 상단 카피 문구 배너 주입
const setCopy = (page, msg) => page.evaluate((m) => {
  let el = document.getElementById('store-copy');
  if (!el) {
    el = document.createElement('div');
    el.id = 'store-copy';
    el.style.cssText = 'padding:22px 20px 6px;font-size:21px;font-weight:900;color:#221B0E;letter-spacing:-0.3px;word-break:keep-all;background:#FBF7EF;font-family:Pretendard,-apple-system,sans-serif;';
    document.body.prepend(el);
  }
  el.textContent = m;
}, msg);
let browser;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(BASE)).ok; } catch { await wait(250); } }
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 318, height: 524, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await wait(300);
  await setCopy(page, '적금 만기액, 세후까지 한 번에');
  await page.screenshot({ path: 'store-assets/shot1.png' });
  await clickTab(page, '목표'); await wait(250);
  await setCopy(page, '목표 금액까지 월 얼마씩?');
  await page.screenshot({ path: 'store-assets/shot2.png' });
  await clickTab(page, '내 적금'); await wait(250);
  await setCopy(page, '내 적금 만기 D-day 관리');
  await page.screenshot({ path: 'store-assets/shot3.png' });
  console.log('shots done');
} finally { await browser?.close(); server.kill(); }
