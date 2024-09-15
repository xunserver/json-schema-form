export const DRAFT_2020_12_URIS = Object.freeze([
  "https://json-schema.org/draft/2020-12/schema",
  "https://json-schema.org/draft/2020-12/schema#",
  "http://json-schema.org/draft/2020-12/schema",
  "http://json-schema.org/draft/2020-12/schema#",
]);

export function isDraft202012Dialect(uri: string): boolean {
  const normalized = uri.endsWith("#") ? uri.slice(0, -1) : uri;
  return DRAFT_2020_12_URIS.some((candidate) => {
    const withoutHash = candidate.endsWith("#") ? candidate.slice(0, -1) : candidate;
    return candidate === uri || withoutHash === normalized;
  });
}
