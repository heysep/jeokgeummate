import { useEffect, useState } from 'react';
import { requestNotificationAgreement } from '@apps-in-toss/web-framework';

const DISMISS_KEY = 'jeokgeummate:pushOptIn';
/** 콘솔에 등록한 기능성 푸시 템플릿 code와 반드시 일치해야 한다 */
const PUSH_TEMPLATE_CODE = 'jeokgeummate-weekly-deposit-reminder';

function readState(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeState(v: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, v);
  } catch {
    /* 저장 실패는 무시 — 다음 방문에 다시 보일 뿐 */
  }
}

/**
 * 주간 납입 예정 알림 수신 동의 유도 배너.
 * - 토스 앱 밖(일반 브라우저)이나 미설정 상태에서는 브리지 호출이 실패한다 → 배너를 숨긴다.
 * - 동의 완료('agreed') 또는 닫기('dismissed') 후에는 다시 보이지 않는다.
 */
export function PushOptIn() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readState() === null);
  }, []);

  if (!visible) return null;

  const subscribe = () => {
    try {
      requestNotificationAgreement({
        options: { templateCode: PUSH_TEMPLATE_CODE },
        onEvent: (e: { type: string }) => {
          // 공식 이벤트 타입: newAgreement | alreadyAgreed | agreementRejected
          if (e.type === 'newAgreement' || e.type === 'alreadyAgreed') {
            writeState('agreed');
          } else {
            writeState('dismissed');
          }
          setVisible(false);
        },
        onError: () => {
          // 미지원 환경/미설정 — 배너만 닫고 기록은 남기지 않는다(설정 후 다시 노출)
          setVisible(false);
        },
      });
    } catch {
      setVisible(false);
    }
  };

  const dismiss = () => {
    writeState('dismissed');
    setVisible(false);
  };

  return (
    <div className="push-optin" role="region" aria-label="납입 알림 받기">
      <div className="push-optin-text">
        <span className="push-optin-title">납입일 놓치지 않기</span>
        <span className="push-optin-desc">매주 월요일 오전 9시에 이번 주 납입 예정 적금을 알려드려요.</span>
      </div>
      <div className="push-optin-actions">
        <button type="button" className="push-optin-btn" onClick={subscribe}>
          받기
        </button>
        <button type="button" className="push-optin-close" onClick={dismiss} aria-label="닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
