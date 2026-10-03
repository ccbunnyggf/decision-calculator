import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAUSIBLE_TRACKER_URL, shouldLoadWebAnalytics, trackLandingEnter, trackModuleOpen } from '../src/analytics.ts';

const config = {
  production: true,
};

test('analytics runs only on the configured production site and path', () => {
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'https://ccbunnyggf.github.io/decision-calculator/#/landing' }), true);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'http://localhost:4173/#/landing' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'http://127.0.0.1:4173/#/landing' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'https://ccbunnyggf.github.io/ielts7-plus/' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'https://ccbunnyggf.github.io/decision-calculator-other/' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'http://ccbunnyggf.github.io/decision-calculator/' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, production: false, currentUrl: 'https://ccbunnyggf.github.io/decision-calculator/' }), false);
});

test('analytics uses the supplied tracker and rejects invalid URLs', () => {
  assert.equal(PLAUSIBLE_TRACKER_URL, 'https://plausible.io/js/pa-CbOUS56nCFZT7XxoS7hdb.js');
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'not-a-url' }), false);
});

test('custom events contain only fixed anonymous module identifiers', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events: unknown[][] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { plausible: (...args: unknown[]) => { events.push(args); } },
  });
  try {
    trackLandingEnter();
    trackModuleOpen('finance');
    trackModuleOpen('consumption');
    trackModuleOpen('transport');
    trackModuleOpen('comparison');
    trackModuleOpen('boundary');
    assert.deepEqual(events, [
      ['landing_enter'],
      ['module_open', { props: { module: 'personal_finance' } }],
      ['module_open', { props: { module: 'consumption' } }],
      ['module_open', { props: { module: 'transport' } }],
      ['module_open', { props: { module: 'comparison' } }],
      ['module_open', { props: { module: 'boundary' } }],
    ]);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
