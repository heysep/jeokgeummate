import { describe, it, expect, beforeEach } from 'vitest';

// 이 프로젝트는 jsdom을 쓰지 않는다(테스트가 node에서 돈다).
// storage.ts가 localStorage 접근을 try/catch로 감싸고 있어, 셋업이 없으면
// 모든 읽기가 조용히 []로 떨어져 테스트가 통과하는 것처럼 보인다 — 최소 shim을 둔다.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

import { loadSavings, saveSavings, type SavedSaving } from './storage';
import { savingsSimple } from './savings';

const KEY = 'jeokgeum.savings.v1';

const base: SavedSaving = {
  id: 'a',
  name: '내 적금',
  monthly: 300000,
  ratePct: 3.5,
  months: 12,
  startDate: '2026-08-01',
};

describe('SavedSaving taxMode 왕복', () => {
  beforeEach(() => localStorage.clear());

  it('비과세로 저장하면 비과세로 복원된다', () => {
    saveSavings([{ ...base, taxMode: 'exempt' }]);
    expect(loadSavings()[0].taxMode).toBe('exempt');
  });

  it('세전도 왕복한다', () => {
    saveSavings([{ ...base, taxMode: 'pre' }]);
    expect(loadSavings()[0].taxMode).toBe('pre');
  });

  /**
   * 이 앱이 실제로 겪은 버그: 저장 시 taxMode가 빠져 '내 적금' 탭이 항상 일반과세로
   * 계산했다. 비과세를 고른 사용자는 방금 본 만기액보다 15.4% 적은 금액을 보게 된다.
   */
  it('비과세 저장분은 일반과세보다 만기액이 크다 — 세금이 붙으면 안 된다', () => {
    saveSavings([{ ...base, taxMode: 'exempt' }]);
    const saved = loadSavings()[0];
    const shown = savingsSimple(saved.monthly, saved.ratePct, saved.months, saved.taxMode ?? 'general');
    const asGeneral = savingsSimple(base.monthly, base.ratePct, base.months, 'general');

    expect(shown.tax).toBe(0);
    expect(shown.total).toBeGreaterThan(asGeneral.total);
  });

  it('taxMode 없는 구 스키마도 버리지 않고 일반과세로 폴백한다', () => {
    localStorage.setItem(KEY, JSON.stringify([base]));
    const saved = loadSavings();
    expect(saved).toHaveLength(1);
    expect(saved[0].taxMode).toBeUndefined();
  });

  it('taxMode가 이상한 값이면 항목을 버린다', () => {
    localStorage.setItem(KEY, JSON.stringify([{ ...base, taxMode: 'weird' }]));
    expect(loadSavings()).toEqual([]);
  });
});
