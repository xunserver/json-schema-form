// @ts-expect-error CompilerContext is not part of the public root barrel
import type { CompilerContext } from "../src/index.js";

// @ts-expect-error DataShape is an internal compiler type
import type { DataShape } from "../src/index.js";

// @ts-expect-error CanonicalSchemaGraph is not a public export
import type { CanonicalSchemaGraph } from "../src/index.js";

// @ts-expect-error mutable builders are not exported from the root
import type { DiagnosticBag } from "../src/index.js";

declare const compilerContext: CompilerContext;
declare const dataShape: DataShape;
declare const graph: CanonicalSchemaGraph;
declare const bag: DiagnosticBag;

void compilerContext;
void dataShape;
void graph;
void bag;
