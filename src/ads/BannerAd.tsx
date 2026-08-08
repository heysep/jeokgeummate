import { useEffect, useRef, useState } from 'react';
import { TossAds } from '@apps-in-toss/web-framework';

type InitState = 'pending' | 'ready' | 'failed';

/**
 * TossAds.initialize는 앱 전체에서 한 번만. 모듈 스코프에 상태를 둬서
 * 배너가 화면마다 재마운트돼도 재초기화하지 않는다.
 */
let initStarted = false;
let initState: InitState = 'pending';
const initListeners = new Set<(state: InitState) => void>();

function notify(state: InitState): void {
  initState = state;
  initListeners.forEach((l) => l(state));
}

function ensureInitialized(): void {
  if (initStarted) return;
  initStarted = true;
  try {
    TossAds.initialize({
      callbacks: {
        onInitialized: () => notify('ready'),
        onInitializationFailed: (error: unknown) => {
          console.error(error);
          notify('failed');
        },
      },
    });
  } catch (error) {
    console.error(error);
    notify('failed');
  }
}

/**
 * 광고 SDK 초기화를 앱 시작 시점으로 앞당긴다.
 *
 * 왜 필요한가 — BannerAd는 initState가 'ready'가 되기 전에는 null을 반환한다.
 * 초기화를 BannerAd의 effect에서 시작하면 첫 페인트 이후에야 시작되는데,
 * 이 앱들은 평균 세션이 20~24초라 그 사이 이탈하면 배너가 "안 붙은 채로" 끝난다.
 * (실측 impressionPerUser 0.5 — 절반이 노출 없이 나감)
 * main.tsx에서 한 번 호출해 두면 React 마운트·데이터 로드와 초기화가 겹쳐 돈다.
 *
 * 토스 앱 밖에서는 isSupported()가 동기로 throw하므로 조용히 넘어간다.
 */
export function initAds(): void {
  try {
    if (!TossAds.initialize.isSupported()) return;
  } catch {
    return;
  }
  ensureInitialized();
}

/**
 * 토스 네이티브 배너 광고. 다음 경우엔 자리를 차지하지 않고 사라진다.
 * - 광고 그룹 ID 미발급(빈 문자열)
 * - 구버전 토스 앱 등 미지원 환경(isSupported=false)
 * - 초기화 실패
 * 빈 회색 박스를 남기면 고장난 것처럼 보이므로 통째로 렌더하지 않는다.
 */
export function BannerAd({ adGroupId, label = '광고' }: { adGroupId: string; label?: string }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const supported = (() => {
    if (adGroupId === '') return false;
    try {
      return TossAds.attachBanner.isSupported() && TossAds.initialize.isSupported();
    } catch {
      // 토스 앱 밖(일반 브라우저)에서는 isSupported()가 동기로 throw한다
      return false;
    }
  })();
  const [state, setState] = useState<InitState>(initState);

  useEffect(() => {
    if (!supported) return;
    ensureInitialized();
    setState(initState);
    initListeners.add(setState);
    return () => {
      initListeners.delete(setState);
    };
  }, [supported]);

  useEffect(() => {
    if (!supported || state !== 'ready' || slotRef.current === null) return;
    // 앱인토스는 라이트 전용 → theme:'light' 고정(auto면 기기 다크모드 따라감)
    const banner = TossAds.attachBanner(adGroupId, slotRef.current, { theme: 'light' });
    return () => {
      banner.destroy();
    };
  }, [adGroupId, supported, state]);

  if (!supported || state !== 'ready') return null;

  return (
    <div className="ad-banner">
      <span className="ad-banner-label">{label}</span>
      <div ref={slotRef} />
    </div>
  );
}
