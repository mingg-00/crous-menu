import { Platform } from 'react-native';

// Google refuses OAuth inside apps' embedded browsers (403 disallowed_useragent). WhatsApp and Telegram open links in
// the system browser view, which Google allows, so they aren't listed.
// ponytail: user-agent list of the apps students share links in; add one when someone reports it.
const IN_APP = /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|musical_ly|BytedanceWebview|Snapchat/i;

const ua = () => (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : '');

export function isInAppBrowser() {
  return IN_APP.test(ua());
}

/** Reopen `url` in the real browser when the app allows it; false when the user has to do it (iOS Instagram etc.). */
export function openInExternalBrowser(url: string): boolean {
  const agent = ua();
  if (/KAKAOTALK/i.test(agent)) {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  } else if (/Line\//i.test(agent)) {
    window.location.href = url + (url.includes('?') ? '&' : '?') + 'openExternalBrowser=1';
  } else if (/Android/i.test(agent)) {
    window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  } else {
    return false;
  }
  return true;
}
