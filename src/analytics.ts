type Plausible = ((event: string, options?: { props?: { module: string } }) => void) & {
  q?: unknown[][];
  init?: (options?: { hashBasedRouting?: boolean }) => void;
  o?: { hashBasedRouting?: boolean };
};

declare global {
  interface Window { plausible?: Plausible }
}

export function shouldLoadWebAnalytics({ production, scriptUrl, publicUrl, currentUrl }: {
  production: boolean;
  scriptUrl?: string;
  publicUrl?: string;
  currentUrl: string;
}): boolean {
  if (!production || !scriptUrl?.trim() || !publicUrl?.trim()) return false;
  try {
    const script = new URL(scriptUrl);
    const expected = new URL(publicUrl);
    const current = new URL(currentUrl);
    if (script.origin !== 'https://plausible.io' || !/^\/js\/pa-[A-Za-z0-9_-]+\.js$/.test(script.pathname) || script.search || script.hash) return false;
    if (expected.protocol !== 'https:' || expected.search || expected.hash) return false;
    const path = expected.pathname.endsWith('/') ? expected.pathname : `${expected.pathname}/`;
    return current.origin === expected.origin && current.pathname.startsWith(path);
  } catch {
    return false;
  }
}

export function installWebAnalytics(): void {
  const scriptUrl = import.meta.env.VITE_PLAUSIBLE_SCRIPT_URL?.trim();
  const publicUrl = import.meta.env.VITE_ANALYTICS_PUBLIC_URL?.trim();
  if (!shouldLoadWebAnalytics({ production: import.meta.env.PROD, scriptUrl, publicUrl, currentUrl: window.location.href })) return;

  const load = () => {
    if (document.querySelector(`script[src="${scriptUrl}"]`)) return;
    const plausible = (window.plausible ?? ((...args: unknown[]) => {
      (plausible.q = plausible.q ?? []).push(args);
    })) as Plausible;
    plausible.init = plausible.init ?? ((options = {}) => { plausible.o = options; });
    window.plausible = plausible;
    plausible.init({ hashBasedRouting: true });
    const script = document.createElement('script');
    script.async = true;
    script.src = scriptUrl!;
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
