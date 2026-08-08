import { STORAGE_PREFIX } from '../config';
import type { TaxMode } from './savings';

export interface SavedSaving {
  id: string;
  name: string;
  monthly: number;
  ratePct: number;
  months: number;
  /** 가입일 YYYY-MM-DD */
  startDate: string;
  /**
   * 저장 당시 고른 과세방식. 이게 없으면 '내 적금'이 일반과세로 계산해
   * 비과세 상품인데 15.4%가 빠진 금액을 보여준다.
   * 구 스키마(v1 초기)로 저장된 항목에는 없으므로 optional — 읽는 쪽에서 'general'로 폴백한다.
   */
  taxMode?: TaxMode;
}

function isTaxMode(v: unknown): v is TaxMode {
  return v === 'pre' || v === 'general' || v === 'exempt';
}

const KEY = `${STORAGE_PREFIX}savings.v1`;

function isSaved(v: unknown): v is SavedSaving {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.monthly === 'number' &&
    typeof o.ratePct === 'number' &&
    typeof o.months === 'number' &&
    typeof o.startDate === 'string' &&
    Number.isFinite(o.monthly) &&
    Number.isFinite(o.ratePct) &&
    Number.isFinite(o.months) &&
    (o.taxMode === undefined || isTaxMode(o.taxMode))
  );
}

/** 손상된 JSON·구 스키마가 있어도 크래시 없이 빈 배열로 복구 */
export function loadSavings(): SavedSaving[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSaved);
  } catch {
    return [];
  }
}

export function saveSavings(list: SavedSaving[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 저장 실패(용량 초과 등)는 조용히 무시 — 다음 렌더에서 메모리 상태 유지
  }
}

/** 마지막으로 계산한 입력값 — 다음에 열면 그대로 복원한다. */
export interface LastInput {
  monthly: string;
  ratePct: string;
  months: string;
  /**
   * taxMode가 없던 시절에 저장된 값도 버리지 않는다. 필수로 두면 검증에서 통째로 탈락해
   * 월 납입액·이율·기간 복원까지 조용히 초기화된다. 읽는 쪽에서 기본값으로 폴백한다.
   */
  taxMode?: string;
}

const LAST_KEY = `${STORAGE_PREFIX}last.v1`;

function isLast(v: unknown): v is LastInput {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.monthly === 'string' &&
    typeof o.ratePct === 'string' &&
    typeof o.months === 'string' &&
    (o.taxMode === undefined || typeof o.taxMode === 'string')
  );
}

export function loadLastInput(): LastInput | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLast(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastInput(v: LastInput): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {
    // 무시
  }
}

/** WebView에서 navigator.clipboard가 없는 경우가 잦아 execCommand로 폴백한다. */
export function copyText(text: string): void {
  try {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
      return;
    }
  } catch {
    // fallthrough
  }
  legacyCopy(text);
}

function legacyCopy(text: string): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    // 복사 실패는 조용히 무시
  }
}
