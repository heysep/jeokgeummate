import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetInterstitial, bumpInterstitialSettled } from './interstitial';

/**
 * play()는 광고 ID가 없으면 즉시 return하므로 실제 SDK 호출은 일어나지 않는다.
 * 여기서 지키려는 것은 **카운트가 언제 올라가는가** 하나다 —
 * 슬라이더 드래그가 문턱을 순식간에 넘겨 드래그 도중 광고가 뜨는 사고를 막는다.
 */

let bumps = 0;
vi.mock('@apps-in-toss/web-framework', () => ({
  loadFullScreenAd: () => {
    bumps++;
  },
  showFullScreenAd: () => {},
}));

beforeEach(() => {
  vi.useFakeTimers();
  bumps = 0;
  __resetInterstitial();
});
afterEach(() => {
  vi.useRealTimers();
});

/** 광고 ID가 주입돼 있을 때만 의미 있는 단언 */
const idInjected = (import.meta.env.VITE_FULLSCREEN_AD_ID ?? '') !== '';

describe('조작이 끝난 뒤에만 센다', () => {
  it('드래그처럼 연속 호출되면 전부 합쳐 1회로 센다', () => {
    for (let i = 0; i < 50; i++) {
      bumpInterstitialSettled(3);
      vi.advanceTimersByTime(16); // 60fps 드래그
    }
    vi.advanceTimersByTime(900);
    // 50번 호출했지만 정착은 한 번 — 문턱 3에 못 미쳐 광고는 뜨지 않는다
    expect(bumps).toBe(0);
  });

  it('떨어진 조작 세 번이면 문턱에 닿는다', () => {
    for (let i = 0; i < 3; i++) {
      bumpInterstitialSettled(3);
      vi.advanceTimersByTime(1000);
    }
    if (idInjected) expect(bumps).toBe(1);
  });

  it('문턱을 넘어도 세션당 한 번을 넘지 않는다', () => {
    for (let i = 0; i < 10; i++) {
      bumpInterstitialSettled(3);
      vi.advanceTimersByTime(1000);
    }
    expect(bumps).toBeLessThanOrEqual(1);
  });

  it('조작 도중에는 절대 뜨지 않는다 — 멈춘 뒤에만 뜬다', () => {
    // 정착 두 번으로 카운트를 2까지 올려 둔다
    for (let i = 0; i < 2; i++) {
      bumpInterstitialSettled(3);
      vi.advanceTimersByTime(1000);
    }
    // 세 번째 조작을 '진행 중'으로 두면 아직 뜨면 안 된다
    bumpInterstitialSettled(3);
    vi.advanceTimersByTime(500);
    expect(bumps).toBe(0);
    // 손을 뗀 뒤에 뜬다
    vi.advanceTimersByTime(500);
    if (idInjected) expect(bumps).toBe(1);
  });
});

describe('앱을 열기만 했을 때', () => {
  it('아무 조작도 안 하면 카운트가 올라가지 않는다', () => {
    /*
      금액 칸에 콤마를 넣으면서 마운트 직후 값이 한 번 정규화될 수 있다.
      그게 정착 카운터를 건드리면 앱을 열 때마다 유령 카운트가 쌓인다.
      호출이 없으면 타이머도 없어야 한다.
    */
    vi.advanceTimersByTime(5000);
    expect(bumps).toBe(0);
  });
});
