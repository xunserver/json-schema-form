import crypto from "node:crypto";
import { REQUIRED_ACCEPTANCE_COUNT, REQUIRED_INVARIANT_COUNT, REQUIRED_SLICE_COUNT, type MatrixIssue } from "./types.ts";

export interface ExtractedArchitecture {
  readonly invariants: readonly ExtractedItem[];
  readonly slices: readonly ExtractedItem[];
  readonly deferred: readonly ExtractedItem[];
  readonly acceptanceCriteria: readonly ExtractedItem[];
  readonly digest: string;
}

export interface ExtractedItem {
  readonly id: string;
  readonly section: number;
  readonly ordinal: number;
  readonly normalizedText: string;
}

export function extractArchitecture(markdown: string): { extracted?: ExtractedArchitecture; issues: MatrixIssue[] } {
  const issues: MatrixIssue[] = [];
  const invariants = extractNumberedSection(markdown, "## 3. 架构不变量", REQUIRED_INVARIANT_COUNT, "INV", 3, issues);
  const range20 = sliceUntilHeading(markdown, "## 20. 首期范围与延后事项", "## 21.");
  const slices = extractNumberedBlock(
    range20,
    "首期必须验证的垂直切片：",
    REQUIRED_SLICE_COUNT,
    "SLICE",
    20,
    issues,
  );
  const deferred = extractBulletBlock(range20, "明确延后：", 8, "DEF", 20, issues);
  const acceptanceCriteria = extractBulletBlock(
    sliceUntilHeading(markdown, "## 21. 架构验收标准", "---"),
    "实现达到以下条件时，说明分层成立：",
    REQUIRED_ACCEPTANCE_COUNT,
    "AC",
    21,
    issues,
  );

  if (issues.length > 0) {
    return { issues };
  }

  const digest = digestArchitecture({ invariants, slices, deferred, acceptanceCriteria });
  return {
    extracted: { invariants, slices, deferred, acceptanceCriteria, digest },
    issues,
  };
}

export function digestArchitecture(parts: {
  readonly invariants: readonly ExtractedItem[];
  readonly slices: readonly ExtractedItem[];
  readonly deferred: readonly ExtractedItem[];
  readonly acceptanceCriteria: readonly ExtractedItem[];
}): string {
  const payload = {
    invariants: parts.invariants.map(canonicalItem),
    slices: parts.slices.map(canonicalItem),
    deferred: parts.deferred.map(canonicalItem),
    acceptanceCriteria: parts.acceptanceCriteria.map(canonicalItem),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function normalizeArchitectureText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function canonicalItem(item: ExtractedItem): { id: string; section: number; ordinal: number; text: string } {
  return { id: item.id, section: item.section, ordinal: item.ordinal, text: item.normalizedText };
}

function extractNumberedSection(
  markdown: string,
  heading: string,
  expected: number,
  prefix: string,
  section: number,
  issues: MatrixIssue[],
): ExtractedItem[] {
  const body = sliceUntilHeading(markdown, heading, "## ");
  return extractNumberedBlock(body, heading, expected, prefix, section, issues);
}

function extractNumberedBlock(
  body: string,
  marker: string,
  expected: number,
  prefix: string,
  section: number,
  issues: MatrixIssue[],
): ExtractedItem[] {
  const start = body.indexOf(marker);
  if (start < 0) {
    issues.push({ code: "missing-section", message: `Architecture section marker not found: ${marker}` });
    return [];
  }
  const region = body.slice(start);
  const matches = [...region.matchAll(/^\s*(\d+)\.\s+(.+)$/gm)];
  const items: ExtractedItem[] = [];
  const seen = new Set<number>();
  for (const match of matches) {
    const ordinal = Number(match[1]);
    if (ordinal < 1 || ordinal > expected) {
      continue;
    }
    if (seen.has(ordinal)) {
      issues.push({
        code: "duplicate-ordinal",
        message: `Duplicate ordinal ${ordinal} in section ${section}`,
        entryId: `${prefix}-${String(ordinal).padStart(2, "0")}`,
      });
      continue;
    }
    seen.add(ordinal);
    items.push({
      id: `${prefix}-${String(ordinal).padStart(2, "0")}`,
      section,
      ordinal,
      normalizedText: normalizeArchitectureText(match[2] ?? ""),
    });
  }
  items.sort((left, right) => left.ordinal - right.ordinal);
  if (items.length !== expected) {
    issues.push({
      code: "count-mismatch",
      message: `Section ${section} expected ${expected} numbered items, found ${items.length}`,
    });
  }
  for (let ordinal = 1; ordinal <= expected; ordinal += 1) {
    if (!seen.has(ordinal)) {
      issues.push({
        code: "missing-ordinal",
        message: `Section ${section} is missing ordinal ${ordinal}`,
        entryId: `${prefix}-${String(ordinal).padStart(2, "0")}`,
      });
    }
  }
  return items;
}

function extractBulletBlock(
  body: string,
  marker: string,
  expected: number,
  prefix: string,
  section: number,
  issues: MatrixIssue[],
): ExtractedItem[] {
  const start = body.indexOf(marker);
  if (start < 0) {
    issues.push({ code: "missing-section", message: `Architecture section marker not found: ${marker}` });
    return [];
  }
  const region = body.slice(start);
  const matches = [...region.matchAll(/^\s*-\s+(.+)$/gm)].slice(0, expected + 4);
  const items: ExtractedItem[] = [];
  for (const [index, match] of matches.entries()) {
    if (index >= expected) {
      issues.push({
        code: "extra-item",
        message: `Section ${section} has extra bullet after ${expected} items`,
        entryId: `${prefix}-${String(index + 1).padStart(2, "0")}`,
      });
      continue;
    }
    items.push({
      id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
      section,
      ordinal: index + 1,
      normalizedText: normalizeArchitectureText(match[1] ?? ""),
    });
  }
  if (items.length !== expected) {
    issues.push({
      code: "count-mismatch",
      message: `Section ${section} expected ${expected} bullet items for ${prefix}, found ${items.length}`,
    });
  }
  return items.slice(0, expected);
}

function sliceUntilHeading(markdown: string, startHeading: string, nextHeading: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) {
    return "";
  }
  const from = markdown.slice(start);
  if (nextHeading === "## ") {
    const next = from.indexOf("\n## ", 1);
    return next >= 0 ? from.slice(0, next) : from;
  }
  const next = from.indexOf(nextHeading, startHeading.length);
  return next >= 0 ? from.slice(0, next) : from;
}
