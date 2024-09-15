export interface ProtocolVersion {
  readonly major: number;
  readonly minor: number;
}

export interface ProtocolCompatibility {
  readonly min: ProtocolVersion;
  readonly maxExclusive?: ProtocolVersion;
}

export const REACT_RENDERER_PROTOCOL: ProtocolVersion = Object.freeze({
  major: 1,
  minor: 0,
});

export function isWellFormedProtocolVersion(value: unknown): value is ProtocolVersion {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const version = value as ProtocolVersion;
  return (
    Number.isInteger(version.major) &&
    version.major >= 0 &&
    Number.isInteger(version.minor) &&
    version.minor >= 0
  );
}

export function compareProtocolVersions(left: ProtocolVersion, right: ProtocolVersion): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  return left.minor - right.minor;
}

export function isProtocolCompatible(
  compatibility: ProtocolCompatibility,
  current: ProtocolVersion = REACT_RENDERER_PROTOCOL,
): boolean {
  if (!isWellFormedProtocolVersion(compatibility.min)) {
    return false;
  }
  if (
    compatibility.maxExclusive !== undefined &&
    !isWellFormedProtocolVersion(compatibility.maxExclusive)
  ) {
    return false;
  }
  if (compareProtocolVersions(current, compatibility.min) < 0) {
    return false;
  }
  if (
    compatibility.maxExclusive !== undefined &&
    compareProtocolVersions(current, compatibility.maxExclusive) >= 0
  ) {
    return false;
  }
  return true;
}
