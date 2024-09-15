export interface EnvironmentIdentity {
  readonly token: symbol;
}

const IDENTITIES = new WeakMap<object, EnvironmentIdentity>();

export function rememberEnvironmentIdentity(environment: object): EnvironmentIdentity {
  const existing = IDENTITIES.get(environment);
  if (existing !== undefined) {
    return existing;
  }

  const identity: EnvironmentIdentity = Object.freeze({
    token: Symbol("FormEnvironment"),
  });
  IDENTITIES.set(environment, identity);
  return identity;
}

export function peekEnvironmentIdentity(environment: object): EnvironmentIdentity | undefined {
  return IDENTITIES.get(environment);
}

export function environmentIdentitiesEqual(
  left: EnvironmentIdentity | undefined,
  right: EnvironmentIdentity | undefined,
): boolean {
  return left !== undefined && right !== undefined && left.token === right.token;
}
