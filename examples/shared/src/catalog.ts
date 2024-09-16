import type { CatalogExample, CatalogExampleMeta, WorkbenchDocument } from "./types.js";
import simple from "../catalog/simple.json" with { type: "json" };
import allFields from "../catalog/all-fields.json" with { type: "json" };
import kitchenSink from "../catalog/kitchen-sink.json" with { type: "json" };
import validation from "../catalog/validation.json" with { type: "json" };
import conditional from "../catalog/conditional.json" with { type: "json" };
import computedArray from "../catalog/computed-array.json" with { type: "json" };

const EXAMPLES: readonly CatalogExample[] = [
  simple as CatalogExample,
  allFields as CatalogExample,
  kitchenSink as CatalogExample,
  validation as CatalogExample,
  conditional as CatalogExample,
  computedArray as CatalogExample,
];

export function listCatalogExamples(): readonly CatalogExampleMeta[] {
  return EXAMPLES.map((example) => ({
    id: example.id,
    title: example.title,
    description: example.description,
  }));
}

export function getCatalogExample(id: string): CatalogExample | undefined {
  return EXAMPLES.find((example) => example.id === id);
}

export function getDefaultCatalogExample(): CatalogExample {
  const kitchen = getCatalogExample("kitchen-sink");
  if (kitchen === undefined) {
    throw new Error("kitchen-sink catalog example is missing");
  }
  return kitchen;
}

export function exampleToDocument(example: CatalogExample): WorkbenchDocument {
  return {
    schemaText: JSON.stringify(example.schema, null, 2),
    uiSchemaText: JSON.stringify(example.uiSchema ?? {}, null, 2),
    rulesText: JSON.stringify(example.rules ?? [], null, 2),
    configText: JSON.stringify(example.config ?? {}, null, 2),
    formDataText: JSON.stringify(example.formData ?? {}, null, 2),
  };
}

export function resolveExampleId(candidate: string | null | undefined): string {
  if (typeof candidate === "string" && getCatalogExample(candidate) !== undefined) {
    return candidate;
  }
  return getDefaultCatalogExample().id;
}

export function readExampleFromSearch(search: string): string {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  return resolveExampleId(new URLSearchParams(normalized).get("example"));
}

type BrowserLocation = {
  readonly search: string;
  readonly href: string;
};

type BrowserHistory = {
  replaceState(data: object, unused: string, url: string): void;
};

function browserGlobals(): { readonly location: BrowserLocation; readonly history: BrowserHistory } | undefined {
  if (typeof globalThis !== "object" || globalThis === null) {
    return undefined;
  }
  const candidate = globalThis as {
    location?: BrowserLocation;
    history?: BrowserHistory;
  };
  if (candidate.location === undefined || candidate.history === undefined) {
    return undefined;
  }
  return { location: candidate.location, history: candidate.history };
}

export function readExampleFromUrl(): string {
  const browser = browserGlobals();
  if (browser === undefined) {
    return getDefaultCatalogExample().id;
  }
  return readExampleFromSearch(browser.location.search);
}

export function writeExampleToUrl(exampleId: string): void {
  const browser = browserGlobals();
  if (browser === undefined) {
    return;
  }
  const url = new URL(browser.location.href);
  url.searchParams.set("example", exampleId);
  browser.history.replaceState({}, "", url.toString());
}
