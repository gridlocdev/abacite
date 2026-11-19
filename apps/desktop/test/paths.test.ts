import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appFile, dataPaths, isAppUrl, isHeadless } from '../src/index.ts';

describe('dataPaths', () => {
  it('moves the app files only when a check asks', () => {
    expect(dataPaths({})).toEqual({ userData: null, temporary: false });
    expect(dataPaths({ ABACITE_USER_DATA: '/tmp/check' })).toEqual({
      userData: path.resolve('/tmp/check'),
      temporary: false,
    });
  });

  it('gives a headless run a throwaway profile unless a check names one', () => {
    const temp = () => '/tmp/abacite-headless-1';
    expect(dataPaths({}, true, temp)).toEqual({ userData: '/tmp/abacite-headless-1', temporary: true });
    expect(dataPaths({ ABACITE_USER_DATA: '/tmp/check' }, true, temp).temporary).toBe(false);
  });
});

describe('isHeadless', () => {
  it('takes the flag or the variable', () => {
    expect(isHeadless(['electron', 'out/main.js', '--headless'], {})).toBe(true);
    expect(isHeadless(['electron', 'out/main.js'], { ABACITE_HEADLESS: '1' })).toBe(true);
    expect(isHeadless(['electron', 'out/main.js'], {})).toBe(false);
  });
});

describe('app:// files', () => {
  const root = path.resolve('/app/web');

  it('serves only inside the web build', () => {
    expect(appFile(root, '/')).toBe(path.join(root, 'index.html'));
    expect(appFile(root, '/assets/index.js')).toBe(path.join(root, 'assets/index.js'));
    expect(appFile(root, '/../main.js')).toBeNull();
    expect(appFile(root, '/%2e%2e/main.js')).toBeNull();
    expect(appFile(root, '/%E0%A4%A')).toBeNull();
  });

  it('trusts only our own page', () => {
    expect(isAppUrl('app://abacite/index.html')).toBe(true);
    expect(isAppUrl('app://abacite.evil/index.html')).toBe(false);
    expect(isAppUrl('https://example.com/')).toBe(false);
    expect(isAppUrl(undefined)).toBe(false);
  });
});
