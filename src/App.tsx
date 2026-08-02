import { useEffect, useMemo, useState } from 'react';
import { BannerAd } from './ads/BannerAd';
import { AD_GROUP_ID } from './ads/config';
import { bumpInterstitial } from './ads/interstitial';
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
  loadLastInput,
  loadSavings,
  saveLastInput,
  saveSavings,
  type SavedSaving,
} from './core/storage';

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
function Icon({ name }: { name: 'coins' | 'target' | 'vault' | 'list' }) {
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

  const saveToMine = () => {
    if (m === 0 || n === 0) return;
    const item: SavedSaving = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: '내 적금',
      monthly: m,
      ratePct: num(rate),
      months: n,
      startDate: todayISO(),
    };
    onSave(item);
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
      <button className="btn-primary" onClick={saveToMine}>
        이 조건으로 내 적금에 저장
      </button>
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
            const res = savingsSimple(it.monthly, it.ratePct, it.months, 'general');
            const done = monthsElapsed(it.startDate, it.months);
            const left = Math.max(it.months - done, 0);
            const ratio = progressRatio(it.startDate, it.months);
            const pct = Math.round(ratio * 100);
            const paid = savingsSimple(it.monthly, it.ratePct, done, 'general');
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
                    <span>이자소득세 15.4%</span>
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
  const [tab, setTab] = useState<Tab>('적금');
  // 저장 목록은 App이 단일 소유자다. SavingsTab과 MyTab이 각자 localStorage에
  // 쓰면 화면마다 다른 목록을 믿게 되고, 저장 직후 요약 줄이 갱신되지 않는다.
  const [savings, setSavings] = useState<SavedSaving[]>(loadSavings);
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
