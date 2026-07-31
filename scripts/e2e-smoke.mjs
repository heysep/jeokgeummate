import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
const PORT = 4729;
const BASE = `http://127.0.0.1:${PORT}`;
const ALLOWED = [/ReactNativeWebView is not available/, /Failed to load resource/];
let passed = 0;
const ok = (c, l) => { if (!c) throw new Error('FAIL: ' + l); passed++; console.log('  ok - ' + l); };
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const setInput = (page, i, v) => page.evaluate(({ idx, val }) => {
  const el = [...document.querySelectorAll('.field-input')][idx];
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, { idx: i, val: v });
const clickTab = (page, name) => page.evaluate((n) => {
  [...document.querySelectorAll('.tab')].find((t) => t.innerText.trim() === n)?.click();
}, name);
let browser;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(BASE)).ok; } catch { await wait(250); } }
  ok(up, 'preview 기동');
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !ALLOWED.some((re) => re.test(m.text()))) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!ALLOWED.some((re) => re.test(e.message))) errs.push(e.message); });
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  const text = () => page.evaluate(() => document.body.innerText);
  const noBad = async (label) => {
    const t = await text();
    for (const bad of ['NaN', 'undefined', 'Infinity', '[object', 'null원']) ok(!t.includes(bad), `노출 없음(${label}): ${bad}`);
  };

  ok((await text()).includes('적금 메이트'), '홈 타이틀');

  // 적금(단리): 월 30만·연 3.5%·12개월·일반과세 → 이자 68,250, 세금 10,511, 총 3,657,739
  await setInput(page, 0, '300000'); await setInput(page, 1, '3.5'); await setInput(page, 2, '12'); await wait(150);
  ok((await text()).includes('3,657,739'), '적금 단리 만기액 (3,657,739원)');
  ok((await text()).includes('68,250'), '세전 이자 (68,250원)');

  // 세전 선택 시 총액 = 3,668,250
  await page.evaluate(() => [...document.querySelectorAll('.chip')].find((c) => c.innerText === '세전')?.click());
  await wait(150);
  ok((await text()).includes('3,668,250'), '세전 만기액 (3,668,250원)');

  // 목표 역산: 이율 0%·10개월·목표 100만 → 월 100,000원
  await clickTab(page, '목표'); await wait(150);
  await setInput(page, 0, '1000000'); await setInput(page, 1, '10'); await setInput(page, 2, '0'); await wait(150);
  ok((await text()).includes('100,000'), '목표 역산 (월 100,000원)');
  await noBad('목표');

  // 예금 단리: 1,000만·3%·12개월·일반과세 → 10,253,800
  await clickTab(page, '예금'); await wait(150);
  ok((await text()).includes('10,253,800'), '예금 단리 만기액 (10,253,800원)');

  // 0 입력 방어
  await setInput(page, 0, '0'); await setInput(page, 2, '0'); await wait(150);
  await noBad('예금 0값');

  // 내 적금 저장 + D-day
  await clickTab(page, '내 적금'); await wait(150);
  await setInput(page, 0, '테스트적금');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === '적금 저장하기')?.click());
  await wait(200);
  let t = await text();
  ok(t.includes('테스트적금'), '적금 저장됨');
  ok(/D-\d+|D-day/.test(t), '만기 D-day 표시');
  await noBad('내 적금');

  // 리로드 영속성
  await page.reload({ waitUntil: 'networkidle0' });
  await clickTab(page, '내 적금'); await wait(200);
  ok((await text()).includes('테스트적금'), '리로드 후 영속성');

  // 손상 localStorage 내성
  await page.evaluate(() => localStorage.setItem('jeokgeum.savings.v1', '{{{corrupt'));
  await page.reload({ waitUntil: 'networkidle0' });
  await clickTab(page, '내 적금'); await wait(200);
  t = await text();
  ok(t.includes('저장한 적금이 없어요'), '손상 localStorage → 빈 상태 복구');
  await noBad('손상 복구');

  ok(errs.length === 0, '콘솔 에러 0건' + (errs.length ? ' — ' + errs[0] : ''));
  console.log(`\nE2E SMOKE PASS — ${passed} assertions`);
} finally { await browser?.close(); server.kill(); }
