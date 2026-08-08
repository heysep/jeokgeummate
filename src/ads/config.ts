export const AD_GROUP_ID = (import.meta.env.VITE_AD_GROUP_ID as string | undefined) ?? '';

/**
 * 리워드(보상형) 광고 그룹 ID. VITE_REWARDED_AD_ID로 주입.
 * 미주입 시 빈 문자열 → canShowRewarded()가 false라 보너스 버튼 자체를 그리지 않는다.
 */
export const REWARDED_AD_ID = (import.meta.env.VITE_REWARDED_AD_ID as string | undefined) ?? '';
