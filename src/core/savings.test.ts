import { describe, expect, it } from 'vitest';
import {
  compoundSavingsInterest,
  dDay,
  depositCompoundInterest,
  depositResult,
  depositSimpleInterest,
  maturityDate,
  requiredMonthly,
  savingsSimple,
  simpleSavingsInterest,
  taxOnInterest,
} from './savings';

describe('단리 적금 이자', () => {
  it('월 10만·연 3%·12개월 = 19,500원 (M×r/12×n(n+1)/2)', () => {
    expect(simpleSavingsInterest(100000, 3, 12)).toBe(19500);
  });

  it('월 30만·연 4.5%·24개월 = 337,500원', () => {
    // 300000 × 0.045/12 × 24×25/2 = 337,500
    expect(simpleSavingsInterest(300000, 4.5, 24)).toBe(337500);
  });

  it('기간 0개월·이율 0%는 이자 0', () => {
    expect(simpleSavingsInterest(100000, 3, 0)).toBe(0);
    expect(simpleSavingsInterest(100000, 0, 12)).toBe(0);
  });

  it('원 미만은 반올림한다', () => {
    // 33333 × 0.0025 × 78 = 6499.935 → 6500
    expect(simpleSavingsInterest(33333, 3, 12)).toBe(6500);
  });

  it('음수·비정상 입력은 0', () => {
    expect(simpleSavingsInterest(-1, 3, 12)).toBe(0);
    expect(simpleSavingsInterest(NaN, 3, 12)).toBe(0);
    expect(simpleSavingsInterest(100000, Infinity, 12)).toBe(0);
  });
});

describe('월복리 적금', () => {
  it('월복리 이자는 단리보다 크다', () => {
    expect(compoundSavingsInterest(100000, 3, 12)).toBeGreaterThan(simpleSavingsInterest(100000, 3, 12));
  });

  it('1개월이면 단리와 동일(월초 납입 1회 × 1개월)', () => {
    expect(compoundSavingsInterest(100000, 3, 1)).toBe(simpleSavingsInterest(100000, 3, 1));
  });
});

describe('세후 반올림 규칙', () => {
  it('일반과세 15.4%는 원 미만 반올림', () => {
    // 19500 × 0.154 = 3003 → 세후 16,497
    expect(taxOnInterest(19500, 'general')).toBe(3003);
    // 12345 × 0.154 = 1901.13 → 1901
    expect(taxOnInterest(12345, 'general')).toBe(1901);
    // 12350 × 0.154 = 1901.9 → 1902
    expect(taxOnInterest(12350, 'general')).toBe(1902);
  });

  it('세전·비과세는 세금 0', () => {
    expect(taxOnInterest(19500, 'pre')).toBe(0);
    expect(taxOnInterest(19500, 'exempt')).toBe(0);
  });

  it('만기 수령액 = 원금 + 세후 이자', () => {
    const r = savingsSimple(100000, 3, 12, 'general');
    expect(r.principal).toBe(1200000);
    expect(r.interest).toBe(19500);
    expect(r.tax).toBe(3003);
    expect(r.netInterest).toBe(16497);
    expect(r.total).toBe(1216497);
  });
});

describe('목표액 역산', () => {
  it('역산한 월 납입액으로 계산하면 목표 이상이고, 1원 적으면 미달', () => {
    for (const mode of ['pre', 'general'] as const) {
      const goal = 10000000;
      const m = requiredMonthly(goal, 3.5, 24, mode);
      expect(savingsSimple(m, 3.5, 24, mode).total).toBeGreaterThanOrEqual(goal);
      expect(savingsSimple(m - 1, 3.5, 24, mode).total).toBeLessThan(goal);
    }
  });

  it('이율 0%면 목표/개월 올림', () => {
    expect(requiredMonthly(10000000, 0, 12, 'pre')).toBe(Math.ceil(10000000 / 12));
  });

  it('목표 0·기간 0은 0', () => {
    expect(requiredMonthly(0, 3, 12, 'pre')).toBe(0);
    expect(requiredMonthly(10000000, 3, 0, 'pre')).toBe(0);
  });
});

describe('예금(거치식)', () => {
  it('단리: 1,000만·연 3%·12개월 = 30만', () => {
    expect(depositSimpleInterest(10000000, 3, 12)).toBe(300000);
  });

  it('월복리는 단리보다 크고, 만기액 = 원금+세후이자', () => {
    expect(depositCompoundInterest(10000000, 3, 12)).toBeGreaterThan(300000);
    const r = depositResult(10000000, 3, 12, false, 'general');
    expect(r.tax).toBe(Math.round(300000 * 0.154));
    expect(r.total).toBe(10000000 + 300000 - 46200);
  });

  it('6개월 단리는 연이자의 절반', () => {
    expect(depositSimpleInterest(10000000, 3, 6)).toBe(150000);
  });
});

describe('만기일·D-day', () => {
  it('개월 더하기 + 말일 클램프', () => {
    expect(maturityDate('2026-08-01', 12)).toBe('2027-08-01');
    expect(maturityDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(maturityDate('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('D-day: 당일 0, 미래 양수, 과거 음수', () => {
    const today = new Date(2026, 7, 1);
    expect(dDay('2026-08-01', today)).toBe(0);
    expect(dDay('2026-08-31', today)).toBe(30);
    expect(dDay('2026-07-31', today)).toBe(-1);
  });
});
