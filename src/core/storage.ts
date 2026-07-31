import { STORAGE_PREFIX } from '../config';

export interface SavedSaving {
  id: string;
  name: string;
  monthly: number;
  ratePct: number;
  months: number;
  /** 가입일 YYYY-MM-DD */
  startDate: string;
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
    Number.isFinite(o.months)
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
