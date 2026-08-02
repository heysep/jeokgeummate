/**
 * 적금·예금 만기 계산 — 전부 순수 함수.
 * 금액은 원(정수) 단위로 반올림해 반환한다.
 */

/** 일반과세(이자소득세 14% + 지방소득세 1.4%) */
export const GENERAL_TAX_RATE = 0.154;
export const MONTHS_PER_YEAR = 12;

export type TaxMode = 'pre' | 'general' | 'exempt';

export interface SavingsResult {
  /** 총 납입 원금 */
  principal: number;
  /** 세전 이자(원 미만 반올림) */
  interest: number;
  /** 세금(원 미만 반올림) */
  tax: number;
  /** 세후 이자 */
  netInterest: number;
  /** 만기 수령액 = 원금 + 세후 이자 */
  total: number;
}

function assertInputs(...ns: number[]): boolean {
  return ns.every((n) => Number.isFinite(n) && n >= 0);
}

/**
 * 단리 적금 세전 이자.
 * 매월 초 납입, i번째 납입금은 (n-i+1)개월 거치 →
 * 이자 = 월납입 × (연이율/12) × n(n+1)/2
 */
export function simpleSavingsInterest(monthly: number, annualRatePct: number, months: number): number {
  if (!assertInputs(monthly, annualRatePct, months) || months === 0) return 0;
  const r = annualRatePct / 100 / MONTHS_PER_YEAR;
  return Math.round(monthly * r * ((months * (months + 1)) / 2));
}

/** 월복리 적금 세전 이자. 매월 초 납입, 매월 복리. */
export function compoundSavingsInterest(monthly: number, annualRatePct: number, months: number): number {
  if (!assertInputs(monthly, annualRatePct, months) || months === 0) return 0;
  const r = annualRatePct / 100 / MONTHS_PER_YEAR;
  let fv = 0;
  for (let i = 0; i < months; i++) fv = (fv + monthly) * (1 + r);
  return Math.round(fv - monthly * months);
}

/** 이자에 대한 세금(원 미만 반올림) */
export function taxOnInterest(interest: number, mode: TaxMode): number {
  if (!Number.isFinite(interest) || interest <= 0) return 0;
  if (mode === 'general') return Math.round(interest * GENERAL_TAX_RATE);
  return 0; // 세전 표시·비과세 모두 세금 0
}

function buildResult(principal: number, interest: number, mode: TaxMode): SavingsResult {
  const tax = taxOnInterest(interest, mode);
  const netInterest = interest - tax;
  return { principal, interest, tax, netInterest, total: principal + netInterest };
}

/** 적금 만기 계산 (단리) */
export function savingsSimple(monthly: number, annualRatePct: number, months: number, mode: TaxMode): SavingsResult {
  return buildResult(Math.round(monthly * months), simpleSavingsInterest(monthly, annualRatePct, months), mode);
}

/** 적금 만기 계산 (월복리) */
export function savingsCompound(monthly: number, annualRatePct: number, months: number, mode: TaxMode): SavingsResult {
  return buildResult(Math.round(monthly * months), compoundSavingsInterest(monthly, annualRatePct, months), mode);
}

/**
 * 목표액 역산: 목표 금액·기간·이율 → 필요한 월 납입액(단리, 올림).
 * 반환값으로 실제 계산하면 만기 수령액이 목표 이상이 되도록 보정한다.
 */
export function requiredMonthly(goal: number, annualRatePct: number, months: number, mode: TaxMode): number {
  if (!assertInputs(goal, annualRatePct, months) || months === 0 || goal === 0) return 0;
  const r = annualRatePct / 100 / MONTHS_PER_YEAR;
  const taxRate = mode === 'general' ? GENERAL_TAX_RATE : 0;
  const perWonInterest = r * ((months * (months + 1)) / 2) * (1 - taxRate);
  let m = Math.ceil(goal / (months + perWonInterest));
  // 반올림 오차 보정: 목표에 못 미치면 1원씩 올린다(이론상 최대 1~2회)
  while (savingsSimple(m, annualRatePct, months, mode).total < goal) m += 1;
  return m;
}

/** 예금(거치식) 단리: 목돈 × 연이율 × 기간(개월)/12 */
export function depositSimpleInterest(principal: number, annualRatePct: number, months: number): number {
  if (!assertInputs(principal, annualRatePct, months)) return 0;
  return Math.round(principal * (annualRatePct / 100) * (months / MONTHS_PER_YEAR));
}

/** 예금(거치식) 월복리 */
export function depositCompoundInterest(principal: number, annualRatePct: number, months: number): number {
  if (!assertInputs(principal, annualRatePct, months)) return 0;
  const r = annualRatePct / 100 / MONTHS_PER_YEAR;
  return Math.round(principal * (Math.pow(1 + r, months) - 1));
}

/** 예금 만기 계산 */
export function depositResult(principal: number, annualRatePct: number, months: number, compound: boolean, mode: TaxMode): SavingsResult {
  const interest = compound
    ? depositCompoundInterest(principal, annualRatePct, months)
    : depositSimpleInterest(principal, annualRatePct, months);
  return buildResult(Math.round(principal), interest, mode);
}

/**
 * 단리 적금 실효수익률(%) — 총 납입 원금 대비 이자 비율.
 * 연이율 3.5%·12개월이어도 평균 예치기간이 6.5개월뿐이라 원금 대비로는
 * 1.9% 수준이다. 이 괴리를 보여주지 않으면 "연 3.5%면 35만원 받겠지" 같은
 * 오해가 남는다.
 */
export function effectiveYieldPct(principal: number, interest: number): number {
  if (!assertInputs(principal, interest) || principal === 0) return 0;
  return (interest / principal) * 100;
}

/** 가입일로부터 오늘까지 경과한 개월 수 (0 ~ months로 클램프) */
export function monthsElapsed(startISO: string, months: number, today: Date = new Date()): number {
  const [y, mo, d] = startISO.split('-').map(Number);
  if (!y || !mo || !d) return 0;
  let elapsed = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - mo);
  if (today.getDate() < d) elapsed -= 1;
  return Math.min(Math.max(elapsed, 0), Math.max(Math.round(months), 0));
}

/** 진행률(0~1). months가 0이면 0. */
export function progressRatio(startISO: string, months: number, today: Date = new Date()): number {
  const n = Math.round(months);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return monthsElapsed(startISO, n, today) / n;
}

/**
 * 개월별 만기 금액 추이 — 그래프용. index 0은 1개월차.
 * 각 시점은 "그 달까지 납입했고 그날 해지한다면 받을 세후 금액".
 */
export function savingsSeries(
  monthly: number,
  annualRatePct: number,
  months: number,
  mode: TaxMode
): number[] {
  const n = Math.round(months);
  if (!assertInputs(monthly, annualRatePct, n) || n <= 0) return [];
  const capped = Math.min(n, 600);
  const out: number[] = [];
  for (let i = 1; i <= capped; i++) out.push(savingsSimple(monthly, annualRatePct, i, mode).total);
  return out;
}

/** 시작일(YYYY-MM-DD) + 개월 수 → 만기일 (말일 넘침은 말일로 클램프) */
export function maturityDate(startISO: string, months: number): string {
  const [y, mo, d] = startISO.split('-').map(Number);
  if (!y || !mo || !d) return '';
  const total = mo - 1 + months;
  const ty = y + Math.floor(total / 12);
  const tm = total % 12;
  const lastDay = new Date(ty, tm + 1, 0).getDate();
  const td = Math.min(d, lastDay);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ty}-${p(tm + 1)}-${p(td)}`;
}

/** 오늘부터 target(YYYY-MM-DD)까지 남은 일수 (당일=0, 지났으면 음수) */
export function dDay(targetISO: string, today: Date = new Date()): number {
  const [y, mo, d] = targetISO.split('-').map(Number);
  if (!y || !mo || !d) return 0;
  const target = new Date(y, mo - 1, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}
