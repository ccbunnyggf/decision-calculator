import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLoadWebAnalytics } from '../src/analytics.ts';

const config = {
  production: true,
  scriptUrl: 'https://plausible.io/js/pa-test-only.js',
  publicUrl: 'https://example.com/decision-calculator/',
};

test('analytics runs only on the configured production site and path', () => {
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'https://example.com/decision-calculator/#/landing' }), true);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'http://localhost:4173/#/landing' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'http://127.0.0.1:4173/#/landing' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'https://example.com/other/' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, currentUrl: 'https://example.com/decision-calculator-other/' }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, production: false, currentUrl: 'https://example.com/decision-calculator/' }), false);
});

test('analytics stays disabled without real configuration', () => {
  const currentUrl = 'https://example.com/decision-calculator/';
  assert.equal(shouldLoadWebAnalytics({ ...config, scriptUrl: '', currentUrl }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, scriptUrl: 'https://evil.example/js/pa-test.js', currentUrl }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, publicUrl: '', currentUrl }), false);
  assert.equal(shouldLoadWebAnalytics({ ...config, publicUrl: 'not-a-url', currentUrl }), false);
});
