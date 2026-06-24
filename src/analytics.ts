// Cookieless, privacy-friendly analytics via Umami (https://umami.is).
//
// Config (build-time env vars; nothing loads if unset, so local dev/tests are
// untouched and no consent banner is needed):
//   VITE_UMAMI_WEBSITE_ID  - the website id from your Umami dashboard
//   VITE_UMAMI_SRC         - script url (default: Umami Cloud)
//
// Umami sets no cookies and stores no per-user identifier, so this does not
// require a cookie-consent banner.

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;
const SRC = (import.meta.env.VITE_UMAMI_SRC as string | undefined) ?? 'https://cloud.umami.is/script.js';

/** Inject the Umami script once, if configured. Auto-tracks the page visit. */
export function initAnalytics(): void {
  if (!WEBSITE_ID || typeof document === 'undefined') return;
  if (document.querySelector('script[data-website-id]')) return;

  const script = document.createElement('script');
  script.defer = true;
  script.src = SRC;
  script.setAttribute('data-website-id', WEBSITE_ID);
  document.head.appendChild(script);
}

/** Fire a custom event. No-op until analytics is configured/loaded. */
export function track(event: string, data?: Record<string, unknown>): void {
  window.umami?.track(event, data);
}
