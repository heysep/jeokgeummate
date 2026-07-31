import { useMemo, useState } from 'react';
import { BannerAd } from './ads/BannerAd';
import { AD_GROUP_ID } from './ads/config';
import {
  compoundSavingsInterest,
  dDay,
  depositResult,
  maturityDate,
  requiredMonthly,
  savingsSimple,
  type TaxMode,
} from './core/savings';
import { loadSavings, saveSavings, type SavedSaving } from './core/storage';

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

function SavingsTab() {
  const [monthly, setMonthly] = useState('300000');
  const [rate, setRate] = useState('3.5');
  const [months, setMonths] = useState('12');
  const [tax, setTax] = useState<TaxMode>('general');

  const m = num(monthly);
  const r = savingsSimple(m, num(rate), num(months), tax);
  const compoundInterest = compoundSavingsInterest(m, num(rate), num(months));
  const compoundTax = tax === 'general' ? Math.round(compoundInterest * 0.154) : 0;
  const compoundTotal = r.principal + compoundInterest - compoundTax;

  return (
    <section className="panel">
      <Field label="월 납입액" value={monthly} onChange={setMonthly} suffix="원" />
      <Field label="연이율" value={rate} onChange={setRate} suffix="%" />
      <Field label="기간" value={months} onChange={setMonths} suffix="개월" />
      <TaxPicker mode={tax} onChange={setTax} />
      <ResultCard
        title="만기 수령액 (단리)"
        big={won(r.total)}
        rows={[
          ['총 납입 원금', won(r.principal)],
          ['세전 이자', won(r.interest)],
          ['세금', won(r.tax)],
          ['세후 이자', won(r.netInterest)],
          ['월복리라면', `${won(compoundTotal)} (+${(compoundTotal - r.total).toLocaleString('ko-KR')}원)`],
        ]}
      />
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
      <Field label="목표 금액" value={goal} onChange={setGoal} suffix="원" />
      <Field label="기간" value={months} onChange={setMonths} suffix="개월" />
      <Field label="연이율" value={rate} onChange={setRate} suffix="%" />
      <TaxPicker mode={tax} onChange={setTax} />
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
      <Field label="맡길 목돈" value={principal} onChange={setPrincipal} suffix="원" />
      <Field label="연이율" value={rate} onChange={setRate} suffix="%" />
      <Field label="기간" value={months} onChange={setMonths} suffix="개월" />
      <div className="chips" role="radiogroup" aria-label="이자 방식">
        <button role="radio" aria-checked={!compound} className={`chip${!compound ? ' on' : ''}`} onClick={() => setCompound(false)}>
          단리
        </button>
        <button role="radio" aria-checked={compound} className={`chip${compound ? ' on' : ''}`} onClick={() => setCompound(true)}>
          월복리
        </button>
      </div>
      <TaxPicker mode={tax} onChange={setTax} />
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

function MyTab() {
  const [items, setItems] = useState<SavedSaving[]>(() => loadSavings());
  const [name, setName] = useState('');
  const [monthly, setMonthly] = useState('300000');
  const [rate, setRate] = useState('3.5');
  const [months, setMonths] = useState('12');
  const [start, setStart] = useState(todayISO());

  const update = (next: SavedSaving[]) => {
    setItems(next);
    saveSavings(next);
  };

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
            return (
              <li key={it.id} className="saving-item">
                <div className="saving-head">
                  <span className="saving-name">{it.name}</span>
                  <span className={`dday${d < 0 ? ' done' : ''}`}>{d < 0 ? '만기 지남' : d === 0 ? 'D-day' : `D-${d}`}</span>
                </div>
                <div className="saving-meta">
                  월 {won(it.monthly)} · 연 {it.ratePct}% · {it.months}개월 · 만기 {end}
                </div>
                <div className="saving-meta">만기 예상 수령액(일반과세) {won(res.total)}</div>
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

export function App() {
  const [tab, setTab] = useState<Tab>('적금');
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

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            <Icon name={icons[t]} />
            <span>{t}</span>
          </button>
        ))}
      </div>

      {tab === '적금' && <SavingsTab />}
      {tab === '목표' && <GoalTab />}
      {tab === '예금' && <DepositTab />}
      {tab === '내 적금' && <MyTab />}

      <BannerAd adGroupId={AD_GROUP_ID} />

      <p className="disclaimer">
        본 계산 결과는 참고용 모의 계산으로 법적 효력이 없어요. 실제 이자·세금은 상품 약관과 가입 조건에 따라 달라질 수
        있어요. 모든 데이터는 기기 안에만 저장돼요.
      </p>
    </div>
  );
}
