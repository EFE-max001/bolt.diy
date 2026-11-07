export type CoepMode = 'credentialless' | 'require-corp';

/**
 * WebContainer needs a cross-origin-isolated page. Chromium and Firefox accept
 * `Cross-Origin-Embedder-Policy: credentialless`, but WebKit (Safari on macOS
 * and every browser on iOS/iPadOS) does not support that value and needs
 * `require-corp` instead.
 */
export function getCoepMode(userAgent: string | null | undefined): CoepMode {
  const ua = userAgent ?? '';

  // Every iOS/iPadOS browser is WebKit under the hood, including Chrome and Firefox on iOS.
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'require-corp';
  }

  // Desktop Safari: has "Safari" but none of the Chromium/Firefox tokens.
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(ua)) {
    return 'require-corp';
  }

  return 'credentialless';
}
