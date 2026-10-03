type Plausible = ((event: string, options?: { props?: { module: string } }) => void) & {
  q?: unknown[][];
  init?: (options?: { hashBasedRouting?: boolean; fileDownloads?: boolean; outboundLinks?: boolean; formSubmissions?: boolean }) => void;
  o?: { hashBasedRouting?: boolean; fileDownloads?: boolean; outboundLinks?: boolean; formSubmissions?: boolean };
};

declare global {
  interface Window { plausible?: Plausible }
}

export const PLAUSIBLE_TRACKER_URL = 'https://plausible.io/js/pa-CbOUS56nCFZT7XxoS7hdb.js';
const PUBLIC_ORIGIN = 'https://ccbunnyggf.github.io';
const PUBLIC_PATH = '/decision-calculator/';

export function shouldLoadWebAnalytics({ production, currentUrl }: {
  production: boolean;
  currentUrl: string;
}): boolean {
  if (!production) return false;
  try {
    const current = new URL(currentUrl);
    return current.origin === PUBLIC_ORIGIN && current.pathname.startsWith(PUBLIC_PATH);
  } catch {
    return false;
  }
}

export function installWebAnalytics(): void {
  if (!shouldLoadWebAnalytics({ production: import.meta.env.PROD, currentUrl: window.location.href })) return;

  const plausible = (window.plausible ?? ((...args: unknown[]) => {
    (plausible.q = plausible.q ?? []).push(args);
  })) as Plausible;
  plausible.init = plausible.init ?? ((options = {}) => { plausible.o = options; });
  window.plausible = plausible;
  plausible.init({ hashBasedRouting: true, fileDownloads: false, outboundLinks: false, formSubmissions: false });

  const load = () => {
    if (document.querySelector(`script[src="${PLAUSIBLE_TRACKER_URL}"]`)) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = PLAUSIBLE_TRACKER_URL;
    script.onerror = () => { script.remove(); window.plausible = undefined; };
    document.head.appendChild(script);
  };

  if (document.readyState === 'complete') window.setTimeout(load, 0);
  else window.addEventListener('load', load, { once: true });
}

const modules = {
  finance: 'personal_finance',
  consumption: 'consumption',
  transport: 'transport',
  comparison: 'comparison',
  boundary: 'boundary',
} as const;

export function trackLandingEnter(): void {
  try { window.plausible?.('landing_enter'); } catch { /* Analytics must not affect navigation. */ }
}

export function trackModuleOpen(module: keyof typeof modules): void {
  try { window.plausible?.('module_open', { props: { module: modules[module] } }); }
  catch { /* Analytics must not affect navigation. */ }
}
