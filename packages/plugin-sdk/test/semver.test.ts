import { describe, expect, it } from 'vitest';

import { compareSemVer, parseSemVer, satisfiesRange } from '../src/index.js';

describe('parseSemVer', () => {
  it('parses a plain version', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined });
  });

  it('parses a prerelease version', () => {
    expect(parseSemVer('1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'beta.1' });
  });

  it('throws on an invalid version', () => {
    expect(() => parseSemVer('not-a-version')).toThrow();
  });
});

describe('compareSemVer', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemVer('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemVer('1.2.0', '1.1.9')).toBe(1);
    expect(compareSemVer('1.1.2', '1.1.1')).toBe(1);
    expect(compareSemVer('1.1.1', '1.1.1')).toBe(0);
    expect(compareSemVer('1.1.0', '1.1.1')).toBe(-1);
  });

  it('treats a prerelease as lower precedence than the same release version', () => {
    expect(compareSemVer('1.0.0-beta', '1.0.0')).toBe(-1);
    expect(compareSemVer('1.0.0', '1.0.0-beta')).toBe(1);
  });
});

describe('satisfiesRange', () => {
  it('matches "*" and empty ranges unconditionally', () => {
    expect(satisfiesRange('0.1.0', '*')).toBe(true);
    expect(satisfiesRange('9.9.9', '')).toBe(true);
  });

  it('supports caret ranges within a 0.x line (minor-locked)', () => {
    expect(satisfiesRange('0.1.0', '^0.1.0')).toBe(true);
    expect(satisfiesRange('0.1.5', '^0.1.0')).toBe(true);
    expect(satisfiesRange('0.2.0', '^0.1.0')).toBe(false);
    expect(satisfiesRange('0.0.9', '^0.1.0')).toBe(false);
  });

  it('supports caret ranges within a 1.x+ line (major-locked)', () => {
    expect(satisfiesRange('1.4.2', '^1.2.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfiesRange('1.1.0', '^1.2.0')).toBe(false);
  });

  it('supports comparison operators', () => {
    expect(satisfiesRange('1.5.0', '>=1.0.0')).toBe(true);
    expect(satisfiesRange('0.9.0', '>=1.0.0')).toBe(false);
    expect(satisfiesRange('1.0.0', '<2.0.0')).toBe(true);
  });

  it('supports space-separated AND clauses and "||" OR groups', () => {
    expect(satisfiesRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfiesRange('2.5.0', '>=1.0.0 <2.0.0')).toBe(false);
    expect(satisfiesRange('2.5.0', '^0.1.0 || ^2.0.0')).toBe(true);
  });
});
