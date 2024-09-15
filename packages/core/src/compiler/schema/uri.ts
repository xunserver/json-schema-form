export const DEFAULT_SCHEMA_BASE_URI = "https://form.local/schema";

const ABSOLUTE_URI = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export interface UriParts {
  readonly body: string;
  readonly fragment: string;
  readonly hasFragment: boolean;
}

export function splitUri(uri: string): UriParts {
  const hash = uri.indexOf("#");
  if (hash === -1) {
    return { body: uri, fragment: "", hasFragment: false };
  }
  return { body: uri.slice(0, hash), fragment: uri.slice(hash + 1), hasFragment: true };
}

export function isAbsoluteUri(uri: string): boolean {
  return ABSOLUTE_URI.test(uri);
}

export function resolveUri(base: string, reference: string): string {
  const ref = splitUri(reference);
  const baseParts = splitUri(base);

  if (ref.body === "") {
    return `${baseParts.body}#${ref.fragment}`;
  }

  if (isAbsoluteUri(ref.body)) {
    return ref.hasFragment ? `${ref.body}#${ref.fragment}` : ref.body;
  }

  const resolvedBody = resolvePath(baseParts.body, ref.body);
  return ref.hasFragment ? `${resolvedBody}#${ref.fragment}` : resolvedBody;
}

export function canonicalNodeId(resourceUri: string, pointer: string): string {
  const body = splitUri(resourceUri).body;
  const normalizedPointer = pointer === "" || pointer === "#" ? "" : pointer.replace(/^#/, "");
  return `${body}#${normalizedPointer}`;
}

function resolvePath(base: string, relative: string): string {
  if (relative.startsWith("//")) {
    const scheme = schemeOf(base);
    return scheme === undefined ? relative : `${scheme}:${relative}`;
  }

  if (relative.startsWith("/")) {
    return authorityPrefix(base) + relative;
  }

  const directory = directoryOf(pathOf(base));
  return replacePath(base, collapseDotSegments(`${directory}${relative}`));
}

function schemeOf(uri: string): string | undefined {
  const index = uri.indexOf(":");
  if (index <= 0) {
    return undefined;
  }
  return uri.slice(0, index);
}

function authorityPrefix(uri: string): string {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd === -1) {
    const colon = uri.indexOf(":");
    return colon === -1 ? "" : uri.slice(0, colon + 1);
  }
  const afterScheme = schemeEnd + 3;
  const pathStart = uri.indexOf("/", afterScheme);
  return pathStart === -1 ? uri : uri.slice(0, pathStart);
}

function pathOf(uri: string): string {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd === -1) {
    const colon = uri.indexOf(":");
    return colon === -1 ? uri : uri.slice(colon + 1);
  }
  const afterScheme = schemeEnd + 3;
  const pathStart = uri.indexOf("/", afterScheme);
  return pathStart === -1 ? "" : uri.slice(pathStart);
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  if (slash === -1) {
    return "";
  }
  return path.slice(0, slash + 1);
}

function replacePath(uri: string, path: string): string {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd === -1) {
    const colon = uri.indexOf(":");
    return colon === -1 ? path : `${uri.slice(0, colon + 1)}${path}`;
  }
  return `${authorityPrefix(uri)}${path.startsWith("/") ? path : `/${path}`}`;
}

function collapseDotSegments(path: string): string {
  const leadingSlash = path.startsWith("/");
  const parts = path.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  const joined = stack.join("/");
  return leadingSlash ? `/${joined}` : joined;
}
