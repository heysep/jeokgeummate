import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

/**
 * 토스 전면(영상) 광고. VITE_FULLSCREEN_AD_ID로 그룹 ID 주입.
 * ID 미발급/미지원/실패는 전부 흡수 — 광고 없이 그대로 진행한다.
 *
 * 빈도 정책: 사용자의 능동 액션 N회째에 1번, 세션당 최대 1회.
 * 진입 즉시 전면광고는 이탈·심사 리스크가 커서 쓰지 않는다.
 */
const FS_AD_ID = (import.meta.env.VITE_FULLSCREEN_AD_ID as string | undefined) ?? '';
const SESSION_CAP = 1;
let shownCount = 0;
let actionCount = 0;

function play(): void {
  if (!FS_AD_ID) return;
  try {
    loadFullScreenAd({
      options: { adGroupId: FS_AD_ID },
      onEvent: (e) => {
        if (e.type === 'loaded') {
          try {
            showFullScreenAd({
              options: { adGroupId: FS_AD_ID },
              onEvent: () => {},
              onError: (err) => console.error(err),
            });
          } catch (err) {
            console.error(err);
          }
        }
      },
      onError: (err) => console.error(err),
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * 능동 액션마다 호출 — threshold회째부터 전면광고 1번(세션 캡 적용).
 *
 * 정확일치(!==)였을 때는 한 상호작용이 bump를 두 번 불러 카운터가 threshold를
 * 건너뛰면 그 세션은 전면광고를 영영 못 띄웠다. 노출 빈도는 그대로 두고
 * 건너뜀만 막는다.
 */
export function bumpInterstitial(threshold: number): void {
  actionCount++;
  if (shownCount >= SESSION_CAP || actionCount < threshold) return;
  shownCount++;
  play();
}

/**
 * 조작이 끝난 뒤에만 1회로 세는 bump.
 *
 * 왜 필요한가: 슬라이더는 onChange를 픽셀마다 부른다. 그대로 세면 드래그 한 번이
 * 문턱을 순식간에 넘겨 **드래그 도중에 전면광고가 튀어나온다.** 사용자에게는
 * 오작동으로 보이고, 콘솔 기준으로는 어뷰징(지면·앱 노출 제한) 판정을 받는 형태다.
 *
 * 마지막 호출로부터 delay 동안 조용하면 그때 한 번만 bump한다.
 * 드래그 한 번 = 1회, 숫자 입력 한 번 = 1회로 수렴한다.
 */
let settleTimer: ReturnType<typeof setTimeout> | undefined;
export function bumpInterstitialSettled(threshold: number, delay = 900): void {
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = undefined;
    bumpInterstitial(threshold);
  }, delay);
}

/** 테스트용 — 모듈 카운터를 초기 상태로 되돌린다. */
export function __resetInterstitial(): void {
  shownCount = 0;
  actionCount = 0;
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = undefined;
}
