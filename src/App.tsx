import { useEffect, useMemo, useState } from 'react';
import { BannerAd } from './ads/BannerAd';
import { AD_GROUP_ID } from './ads/config';
import { bumpInterstitial } from './ads/interstitial';
import { PushOptIn } from './components/PushOptIn';
import {
  compoundSavingsInterest,
  dDay,
  depositResult,
  effectiveYieldPct,
  maturityDate,
  monthsElapsed,
  progressRatio,
  requiredMonthly,
  savingsSeries,
  savingsSimple,
  taxOnInterest,
  type TaxMode,
} from './core/savings';
import {
  copyText,
  loadLastInput,
  loadSavings,
  saveLastInput,
  saveSavings,
  type SavedSaving,
} from './core/storage';

// 보너스(금리 비교)는 순수 추가분이라 기존 import 줄을 건드리지 않고 따로 가져온다.
import { canShowRewarded, showRewarded } from './ads/rewarded';

/** 보너스에서 비교할 금리 차이(%p) */
const RATE_DELTAS = [-1, -0.5, -0.25, 0.25, 0.5, 1] as const;

/**
 * 보너스 해제 여부. 탭을 옮기면 SavingsTab이 다시 마운트되므로 컴포넌트 state로 두면
 * 광고를 본 사실이 사라진다. 모듈 스코프에 둬서 앱이 살아 있는 동안 유지한다.
 */
let rateUnlocked = false;

const TABS = ['적금', '목표', '예금', '내 적금'] as const;
type Tab = (typeof TABS)[number];

const TAX_MODES: { key: TaxMode; label: string }[] = [
  { key: 'pre', label: '세전' },
  { key: 'general', label: '일반과세 15.4%' },
  { key: 'exempt', label: '비과세' },
];

function num(v: string): number {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function won(n: number): string {
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('ko-KR')}원` : '-';
}

/** SVG 라인 아이콘 24px, stroke 1.8 (이모지 금지) */
function Icon({ name }: { name: 'coins' | 'target' | 'vault' | 'list' | 'copy' | 'check' }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'coins')
    return (
      <svg {...common}>
        <ellipse cx="10" cy="17" rx="5.5" ry="2.4" />
        <path d="M4.5 13.4c0 1.3 2.5 2.4 5.5 2.4s5.5-1.1 5.5-2.4" />
        <ellipse cx="10" cy="9.8" rx="5.5" ry="2.4" />
        <path d="M19 14.5V5.8m0 0-2.4 2.4M19 5.8l2.4 2.4" />
      </svg>
    );
  if (name === 'target')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.2" />
        <circle cx="12" cy="12" r="4.4" />
        <circle cx="12" cy="12" r="0.9" fill="currentColor" />
      </svg>
    );
  if (name === 'vault')
    return (
      <svg {...common}>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 8.4V6.8M12 17.2v-1.6M15.6 12h1.6M6.8 12h1.6" />
      </svg>
    );
  if (name === 'copy')
    return (
      <svg {...common}>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      </svg>
    );
  if (name === 'check')
    return (
      <svg {...common}>
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
      <circle cx="4.6" cy="6.5" r="0.9" fill="currentColor" />
      <circle cx="4.6" cy="12" r="0.9" fill="currentColor" />
      <circle cx="4.6" cy="17.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-wrap">
        <input
          className="field-input"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 13))}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </label>
  );
}

/**
 * 입력칸 + 슬라이더. 슬라이더는 onChange(input)와 같은 상태를 즉시 갱신하므로
 * 드래그하는 동안 결과가 실시간으로 다시 계산된다(재입력 강요 금지).
 * 직접 타이핑한 값이 슬라이더 상한을 넘어도 자르지 않는다 — 슬라이더는
 * "흔한 범위"일 뿐 허용 한계가 아니다.
 */
function SliderField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  min: number;
  max: number;
  step: number;
}) {
  const n = num(value);
  const knob = Math.min(Math.max(n, min), max);
  return (
    <div className="slider-field">
      <Field label={label} value={value} onChange={onChange} suffix={suffix} />
      <input
        className="slider"
        type="range"
        aria-label={`${label} 슬라이더`}
        min={min}
        max={max}
        step={step}
        value={knob}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * 만기 금액 추이 — 개월별 세후 수령액을 꺾은선으로 그린다.
 * 외부 차트 라이브러리를 쓰지 않고 SVG를 직접 그린다(번들 크기).
 */
function TrendChart({ series, months }: { series: number[]; months: number }) {
  if (series.length < 2) return null;
  const w = 300;
  const h = 110;
  const pad = 6;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (series.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1).toFixed(1)} ${h - pad} L${x(0).toFixed(1)} ${h - pad} Z`;
  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">만기까지 쌓이는 금액</span>
        <span className="chart-note">{months}개월 · 세후 기준</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label="개월별 예상 수령액 추이">
        <path d={area} fill="rgba(184, 134, 11, 0.14)" />
        <path
          d={line}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={x(series.length - 1)} cy={y(series[series.length - 1])} r="3.6" fill="var(--gold-deep)" />
      </svg>
      <div className="chart-axis">
        <span>1개월 {won(series[0])}</span>
        <span>만기 {won(series[series.length - 1])}</span>
      </div>
    </div>
  );
}

function TaxPicker({ mode, onChange }: { mode: TaxMode; onChange: (m: TaxMode) => void }) {
  return (
    <div className="chips" role="radiogroup" aria-label="과세 방식">
      {TAX_MODES.map((t) => (
        <button
          key={t.key}
          role="radio"
          aria-checked={mode === t.key}
          className={`chip${mode === t.key ? ' on' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ResultCard({ title, rows, big }: { title: string; rows: [string, string][]; big: string }) {
  return (
    <div className="result">
      <span className="result-title">{title}</span>
      <span className="result-big">{big}</span>
      <div className="result-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="result-row">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SavingsTab({ onSave }: { onSave: (item: SavedSaving) => void }) {
  const last = useMemo(() => loadLastInput(), []);
  const [monthly, setMonthly] = useState(last?.monthly ?? '300000');
  const [rate, setRate] = useState(last?.ratePct ?? '3.5');
  const [months, setMonths] = useState(last?.months ?? '12');
  const [tax, setTax] = useState<TaxMode>(
    last?.taxMode === 'pre' || last?.taxMode === 'exempt' ? last.taxMode : 'general'
  );

  // 마지막 입력은 계속 저장해 둔다 — 다음에 열면 어제 보던 그 계산이 그대로 뜬다.
  useEffect(() => {
    saveLastInput({ monthly, ratePct: rate, months, taxMode: tax });
  }, [monthly, rate, months, tax]);

  const m = num(monthly);
  const n = Math.round(num(months));
  const r = savingsSimple(m, num(rate), n, tax);
  const compoundInterest = compoundSavingsInterest(m, num(rate), n);
  const compoundTotal = r.principal + compoundInterest - taxOnInterest(compoundInterest, tax);
  const series = savingsSeries(m, num(rate), n, tax);
  const effective = effectiveYieldPct(r.principal, r.interest);
  const effectiveNet = effectiveYieldPct(r.principal, r.netInterest);

  // 보너스: 금리가 달라지면 만기 수령액이 얼마나 달라지는지. 광고를 본 뒤 열린다.
  const [bonus, setBonus] = useState(rateUnlocked);
  const [bonusLoading, setBonusLoading] = useState(false);
  const unlockBonus = () => {
    if (bonus || bonusLoading) return;
    setBonusLoading(true);
    showRewarded({
      onReward: () => {
        rateUnlocked = true;
        setBonus(true);
      },
      onClose: () => setBonusLoading(false),
    });
  };
  // 금리는 음수가 될 수 없다 — 0% 아래로 내려가는 칸은 아예 만들지 않는다.
  const rateRows = useMemo(() => {
    if (!bonus || m === 0 || n === 0) return [];
    const baseRate = num(rate);
    return RATE_DELTAS.filter((d) => baseRate + d >= 0).map((d) => {
      const total = savingsSimple(m, baseRate + d, n, tax).total;
      return { delta: d, ratePct: baseRate + d, total, diff: total - r.total };
    });
  }, [bonus, m, n, rate, tax, r.total]);

  const saveToMine = () => {
    if (m === 0 || n === 0) return;
    const item: SavedSaving = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: '내 적금',
      monthly: m,
      ratePct: num(rate),
      months: n,
      startDate: todayISO(),
      taxMode: tax,
    };
    onSave(item);
  };

  const [copied, setCopied] = useState(false);
  /**
   * 결과 카드가 이미 화면에 뜬 뒤에만 눌리는 버튼이라 "결과보다 광고가 먼저" 경로가
   * 생기지 않는다. 임계값은 이 화면의 기존 호출부와 같은 2 — 카운터가 모듈 스코프 공유다.
   * 딥링크는 카톡 등에 붙여넣으면 탭이 되지 않으므로 검색 문구를 발급처로 남긴다.
   */
  const onCopy = () => {
    copyText(
      [
        `월 ${won(m)} · 연 ${num(rate)}% · ${n}개월 적금`,
        `만기 수령액(단리) ${won(r.total)}`,
        `원금 ${won(r.principal)} · 세후 이자 ${won(r.netInterest)}`,
        '',
        "토스에서 '적금 메이트' 검색",
      ].join('\n')
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    bumpInterstitial(2);
  };

  return (
    <section className="panel">
      <SliderField label="월 납입액" value={monthly} onChange={setMonthly} suffix="원" min={0} max={2000000} step={10000} />
      <SliderField label="연이율" value={rate} onChange={setRate} suffix="%" min={0} max={10} step={0.1} />
      <SliderField label="기간" value={months} onChange={setMonths} suffix="개월" min={1} max={60} step={1} />
      <TaxPicker mode={tax} onChange={(v) => { setTax(v); bumpInterstitial(2); }} />
      <ResultCard
        title="만기 수령액 (단리)"
        big={won(r.total)}
        rows={[
          ['총 납입 원금', won(r.principal)],
          ['세전 이자', won(r.interest)],
          [tax === 'general' ? '이자소득세 15.4%' : '세금', `-${won(r.tax)}`],
          ['세후 이자', won(r.netInterest)],
          ['월복리라면', `${won(compoundTotal)} (+${(compoundTotal - r.total).toLocaleString('ko-KR')}원)`],
        ]}
      />
      {/*
        저장 CTA는 결과 카드 바로 아래에 둔다.
        예전에는 차트·수익률 노트·보너스 표를 전부 지나야 나왔다. 그런데 이 앱의
        재방문 장치(내 적금 진행률·만기 D-day·ReturnStrip)는 전부 '저장된 항목이 있을 때'만
        작동한다. 첫 세션에 저장이 안 되면 리텐션 구조 자체가 켜지지 않는다(실측 D1 1.2%).
      */}
      <button className="btn-primary" onClick={saveToMine}>
        이 조건으로 내 적금에 저장
      </button>
      {/* 저장 CTA의 자리(리텐션 근거)는 그대로 두고 그 아래에 온다 — 결과를 가리지 않는다 */}
      <button className="copy-btn" onClick={onCopy}>
        <Icon name={copied ? 'check' : 'copy'} />
        {copied ? '복사했어요' : '결과 복사'}
      </button>
      <TrendChart series={series} months={n} />
      <div className="note">
        <span className="note-title">원금 대비 실제 수익률</span>
        <span className="note-big">
          {effectiveNet.toFixed(2)}%<span className="note-unit"> (세전 {effective.toFixed(2)}%)</span>
        </span>
        <span className="note-body">
          적금은 매달 나눠 넣기 때문에 평균 예치 기간이 절반 남짓이에요. 그래서 연 {num(rate)}% 상품이어도 총 납입
          원금 대비로는 {effectiveNet.toFixed(2)}%가 돼요.
        </span>
      </div>
      {/* 보너스 — 토스 앱 밖에서는 canShowRewarded()가 false라 버튼 자체가 안 보인다 */}
      {canShowRewarded() && !bonus && (
        <button type="button" className="bonus-cta" onClick={unlockBonus} disabled={bonusLoading}>
          {bonusLoading ? '광고 확인 중' : '광고 보고 금리가 달라지면 얼마나 차이 나는지 보기'}
        </button>
      )}
      {bonus && (
        <div className="note">
          <span className="note-title">금리가 달라지면 (단리 · {n}개월)</span>
          {rateRows.length === 0 && (
            <span className="note-body">월 납입액과 기간을 넣으면 금리별 차이를 보여 드려요.</span>
          )}
          <div className="rate-list">
            {rateRows.map((row) => (
              <div className="rate-row" key={row.delta}>
                <span className="rate-pct">
                  연 {row.ratePct.toFixed(2)}%
                  <span className="rate-delta">
                    {row.delta > 0 ? '+' : ''}
                    {row.delta}%p
                  </span>
                </span>
                <span className="rate-total">{won(row.total)}</span>
                <span className={`rate-diff${row.diff >= 0 ? ' up' : ' down'}`}>
                  {row.diff >= 0 ? '+' : '-'}
                  {won(Math.abs(row.diff))}
                </span>
              </div>
            ))}
          </div>
          <span className="note-body">
            연 {num(rate)}% 기준 {won(r.total)}과 비교한 값이에요. 금리 차이가 만기에 얼마로 돌아오는지 그대로
            보여 드려요.
          </span>
        </div>
      )}

    </section>
  );
}

function GoalTab() {
  const [goal, setGoal] = useState('10000000');
  const [rate, setRate] = useState('3.5');
  const [months, setMonths] = useState('24');
  const [tax, setTax] = useState<TaxMode>('general');

  const need = requiredMonthly(num(goal), num(rate), num(months), tax);
  const check = savingsSimple(need, num(rate), num(months), tax);

  return (
    <section className="panel">
      <SliderField label="목표 금액" value={goal} onChange={setGoal} suffix="원" min={0} max={100000000} step={1000000} />
      <SliderField label="기간" value={months} onChange={setMonths} suffix="개월" min={1} max={60} step={1} />
      <SliderField label="연이율" value={rate} onChange={setRate} suffix="%" min={0} max={10} step={0.1} />
      <TaxPicker mode={tax} onChange={(m) => { setTax(m); bumpInterstitial(2); }} />
      <ResultCard
        title="필요한 월 납입액 (단리 기준)"
        big={need === 0 ? '-' : `월 ${won(need)}`}
        rows={
          need === 0
            ? [['안내', '목표 금액과 기간을 입력해 주세요']]
            : [
                ['총 납입 원금', won(check.principal)],
                ['세후 이자', won(check.netInterest)],
                ['만기 예상 수령액', won(check.total)],
              ]
        }
      />
    </section>
  );
}

function DepositTab() {
  const [principal, setPrincipal] = useState('10000000');
  const [rate, setRate] = useState('3');
  const [months, setMonths] = useState('12');
  const [compound, setCompound] = useState(false);
  const [tax, setTax] = useState<TaxMode>('general');

  const r = depositResult(num(principal), num(rate), num(months), compound, tax);

  return (
    <section className="panel">
      <SliderField label="맡길 목돈" value={principal} onChange={setPrincipal} suffix="원" min={0} max={100000000} step={1000000} />
      <SliderField label="연이율" value={rate} onChange={setRate} suffix="%" min={0} max={10} step={0.1} />
      <SliderField label="기간" value={months} onChange={setMonths} suffix="개월" min={1} max={60} step={1} />
      <div className="chips" role="radiogroup" aria-label="이자 방식">
        <button role="radio" aria-checked={!compound} className={`chip${!compound ? ' on' : ''}`} onClick={() => setCompound(false)}>
          단리
        </button>
        <button role="radio" aria-checked={compound} className={`chip${compound ? ' on' : ''}`} onClick={() => setCompound(true)}>
          월복리
        </button>
      </div>
      <TaxPicker mode={tax} onChange={(m) => { setTax(m); bumpInterstitial(2); }} />
      <ResultCard
        title={`예금 만기 수령액 (${compound ? '월복리' : '단리'})`}
        big={won(r.total)}
        rows={[
          ['원금', won(r.principal)],
          ['세전 이자', won(r.interest)],
          ['세금', won(r.tax)],
          ['세후 이자', won(r.netInterest)],
        ]}
      />
    </section>
  );
}

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function MyTab({ items, onChange }: { items: SavedSaving[]; onChange: (next: SavedSaving[]) => void }) {
  const [name, setName] = useState('');
  const [monthly, setMonthly] = useState('300000');
  const [rate, setRate] = useState('3.5');
  const [months, setMonths] = useState('12');
  const [start, setStart] = useState(todayISO());

  const update = onChange;

  const add = () => {
    if (num(monthly) === 0 || num(months) === 0) return;
    const item: SavedSaving = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() === '' ? '내 적금' : name.trim(),
      monthly: num(monthly),
      ratePct: num(rate),
      months: Math.round(num(months)),
      startDate: start,
    };
    update([item, ...items]);
    setName('');
  };

  return (
    <section className="panel">
      <label className="field">
        <span className="field-label">적금 이름</span>
        <input
          className="field-input"
          type="text"
          placeholder="예: 여행 자금"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="grid2">
        <Field label="월 납입액" value={monthly} onChange={setMonthly} suffix="원" />
        <Field label="연이율" value={rate} onChange={setRate} suffix="%" />
      </div>
      <div className="grid2">
        <Field label="기간" value={months} onChange={setMonths} suffix="개월" />
        <label className="field">
          <span className="field-label">가입일</span>
          <input className="field-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
      </div>
      <button className="btn-primary" onClick={add}>
        적금 저장하기
      </button>

      {items.length === 0 ? (
        <p className="empty">저장한 적금이 없어요. 위에서 첫 적금을 등록해 보세요.</p>
      ) : (
        <ul className="saving-list">
          {items.map((it) => {
            const end = maturityDate(it.startDate, it.months);
            const d = dDay(end);
            // 저장 당시 고른 과세방식으로 계산해야 방금 본 금액과 일치한다. 구 스키마는 일반과세로 폴백.
            const mode = it.taxMode ?? 'general';
            const res = savingsSimple(it.monthly, it.ratePct, it.months, mode);
            const done = monthsElapsed(it.startDate, it.months);
            const left = Math.max(it.months - done, 0);
            const ratio = progressRatio(it.startDate, it.months);
            const pct = Math.round(ratio * 100);
            const paid = savingsSimple(it.monthly, it.ratePct, done, mode);
            return (
              <li key={it.id} className="saving-item">
                <div className="saving-head">
                  <span className="saving-name">{it.name}</span>
                  <span className={`dday${d < 0 ? ' done' : ''}`}>{d < 0 ? '만기 지남' : d === 0 ? 'D-day' : `D-${d}`}</span>
                </div>
                <div className="progress">
                  <div className="progress-bar">
                    <span className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="progress-meta">
                    <span>
                      {done}/{it.months}개월 납입 · {pct}% 진행
                    </span>
                    <span>{left === 0 ? '만기 도달' : `${left}개월 남음`}</span>
                  </div>
                </div>
                <div className="saving-meta">지금까지 납입 원금 {won(paid.principal)}</div>
                <div className="saving-meta">
                  월 {won(it.monthly)} · 연 {it.ratePct}% · {it.months}개월 · 만기 {end}
                </div>
                <div className="saving-rows">
                  <div className="saving-row">
                    <span>총 납입 원금</span>
                    <span>{won(res.principal)}</span>
                  </div>
                  <div className="saving-row">
                    <span>세전 이자</span>
                    <span>{won(res.interest)}</span>
                  </div>
                  <div className="saving-row">
                    <span>{mode === 'general' ? '이자소득세 15.4%' : mode === 'exempt' ? '비과세' : '세전'}</span>
                    <span>-{won(res.tax)}</span>
                  </div>
                  <div className="saving-row strong">
                    <span>만기 예상 수령액</span>
                    <span>{won(res.total)}</span>
                  </div>
                </div>
                <button className="btn-del" onClick={() => update(items.filter((x) => x.id !== it.id))}>
                  삭제
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** 저장된 적금 중 가장 먼저 만기가 오는 것 한 줄 요약 — 재방문 이유. */
function ReturnStrip({ items, onOpen }: { items: SavedSaving[]; onOpen: () => void }) {
  if (items.length === 0) return null;
  const next = items
    .map((it) => ({ it, d: dDay(maturityDate(it.startDate, it.months)) }))
    .filter((x) => x.d >= 0)
    .sort((a, b) => a.d - b.d)[0];
  if (!next) return null;
  const pct = Math.round(progressRatio(next.it.startDate, next.it.months) * 100);
  return (
    <button className="strip" onClick={onOpen}>
      <span className="strip-name">{next.it.name}</span>
      <span className="strip-meta">
        {pct}% 진행 · {next.d === 0 ? '오늘 만기' : `만기까지 ${next.d}일`}
      </span>
    </button>
  );
}

export function App() {
  // 저장 목록은 App이 단일 소유자다. SavingsTab과 MyTab이 각자 localStorage에
  // 쓰면 화면마다 다른 목록을 믿게 되고, 저장 직후 요약 줄이 갱신되지 않는다.
  const [savings, setSavings] = useState<SavedSaving[]>(loadSavings);
  /**
   * 저장한 적금이 있으면 '내 적금'으로 시작한다.
   *
   * 실측 D1 1.2%, DAU의 98%가 신규였다. 계산은 첫 화면에서 이미 끝나 버려서
   * 다시 열 이유가 없었는데, 어렵게 돌아온 사람마저 계산기 탭부터 보게 하면
   * "내가 담아둔 것"에 닿기까지 한 번 더 눌러야 했다. 재방문자에게는 자기 적금이 홈이다.
   */
  const [tab, setTab] = useState<Tab>(() => (loadSavings().length > 0 ? '내 적금' : '적금'));
  const updateSavings = (next: SavedSaving[]) => {
    setSavings(next);
    saveSavings(next);
  };
  const icons: Record<Tab, 'coins' | 'target' | 'vault' | 'list'> = useMemo(
    () => ({ 적금: 'coins', 목표: 'target', 예금: 'vault', '내 적금': 'list' }),
    []
  );

  return (
    <div className="app">
      <header>
        <h1 className="hdr-title">적금 메이트</h1>
        <p className="hdr-sub">적금·예금 만기액과 목표 월 납입액을 한 번에</p>
      </header>

      <ReturnStrip items={savings} onOpen={() => setTab('내 적금')} />

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            <Icon name={icons[t]} />
            <span>{t}</span>
          </button>
        ))}
      </div>

      {/*
        게이트를 걸지 않는다. 저장한 적금이 있어야 보여주면, 정작 동의를 받아야 할
        신규 사용자에게는 배너가 영영 안 뜬다(D1 1%의 직접 원인). PushOptIn 내부에서
        동의·닫기 이력으로 재노출을 막으므로 여기서 추가 조건은 불필요하다.
      */}
      <PushOptIn />

      {tab === '적금' && <SavingsTab
          onSave={(item) => {
            updateSavings([item, ...savings]);
            setTab('내 적금');
          }}
        />}
      {tab === '목표' && <GoalTab />}
      {tab === '예금' && <DepositTab />}
      {tab === '내 적금' && <MyTab items={savings} onChange={updateSavings} />}

      <p className="disclaimer">
        본 계산 결과는 참고용 모의 계산으로 법적 효력이 없어요. 실제 이자·세금은 상품 약관과 가입 조건에 따라 달라질 수
        있어요. 모든 데이터는 기기 안에만 저장돼요.
      </p>

      {/* 배너는 sticky라 마지막에 와야 화면 하단에 붙는다 */}
      <BannerAd adGroupId={AD_GROUP_ID} />
    </div>
  );
}
