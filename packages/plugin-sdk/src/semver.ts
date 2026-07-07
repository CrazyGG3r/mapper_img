/**
 * Minimal, dependency-free semver comparison used to validate a plugin's
 * declared `sdkVersionRange` against the host's installed
 * `@topview/plugin-sdk` version. Deliberately not a full semver
 * implementation -- it supports exactly the range grammar the rest of this
 * SDK needs: `*`, exact versions, comparison operators
 * (`=`,`>`,`>=`,`<`,`<=`), caret (`^`) and tilde (`~`) ranges, space-separated
 * AND clauses, and `||`-separated OR groups.
 */

export interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string;
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

export function parseSemVer(version: string): ParsedSemVer {
  const match = SEMVER_RE.exec(version.trim());
  if (!match) {
    throw new Error(`Invalid semantic version: "${version}"`);
  }
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease,
  };
}

/** Returns -1 if a < b, 0 if equal, 1 if a > b (numeric major/minor/patch, then prerelease precedence). */
export function compareSemVer(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  // A version with a prerelease has lower precedence than the same version without one.
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && pb.prerelease) {
    if (pa.prerelease === pb.prerelease) return 0;
    return pa.prerelease > pb.prerelease ? 1 : -1;
  }
  return 0;
}

function satisfiesSingle(version: string, single: string): boolean {
  const opMatch = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(single);
  if (!opMatch) return false;
  const [, op = '=', rawTarget] = opMatch;
  // The second capture group (`(.+)$`) is not optional in SEMVER_RE's host
  // pattern, so it is always present whenever `opMatch` itself matched --
  // this guard only exists to satisfy `noUncheckedIndexedAccess`.
  if (rawTarget === undefined) return false;
  const target = parseSemVer(rawTarget);
  const v = parseSemVer(version);

  switch (op) {
    case '=':
      return compareSemVer(version, rawTarget) === 0;
    case '>':
      return compareSemVer(version, rawTarget) > 0;
    case '>=':
      return compareSemVer(version, rawTarget) >= 0;
    case '<':
      return compareSemVer(version, rawTarget) < 0;
    case '<=':
      return compareSemVer(version, rawTarget) <= 0;
    case '^':
      // Caret: compatible within the leftmost non-zero component.
      if (target.major > 0) {
        return v.major === target.major && compareSemVer(version, rawTarget) >= 0;
      }
      if (target.minor > 0) {
        return v.major === 0 && v.minor === target.minor && compareSemVer(version, rawTarget) >= 0;
      }
      return v.major === 0 && v.minor === 0 && v.patch === target.patch;
    case '~':
      // Tilde: allow patch-level changes only.
      return v.major === target.major && v.minor === target.minor && compareSemVer(version, rawTarget) >= 0;
    default:
      return false;
  }
}

/**
 * Checks whether `version` satisfies a range expression such as `"^0.1.0"`,
 * `">=0.1.0 <0.3.0"`, or `"1.0.0 || ^2.0.0"`. `"*"` and `""` always match.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === '*' || trimmed === '') return true;

  const orGroups = trimmed.split(/\s*\|\|\s*/);
  return orGroups.some((group) =>
    group
      .split(/\s+/)
      .filter(Boolean)
      .every((clause) => satisfiesSingle(version, clause)),
  );
}
