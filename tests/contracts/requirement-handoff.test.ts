import { describe, expect, test } from "vitest";
import { compileForm, defineForm } from "@form/core";
import type { FieldRequirementPresentation, SchemaPath } from "@form/core";

function effectiveRequired(
  requirement: FieldRequirementPresentation | undefined,
  activeSources: ReadonlySet<SchemaPath>,
): boolean {
  if (requirement === undefined || requirement.status === "optional") {
    return false;
  }
  if (requirement.status === "required") {
    return true;
  }
  return (requirement.activationSources ?? []).some((source) => activeSources.has(source));
}

describe("requirement presentation handoff for renderer binding ports", () => {
  test("computes effective required from Field source refs and activation state only", () => {
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" } },
          if: { properties: { kind: { const: "company" } }, required: ["kind"] },
          then: { properties: { companyName: { type: "string" } }, required: ["companyName"] },
          else: { properties: { personalName: { type: "string" } } },
        },
      }),
    );

    const company = model.ui.fields.get("companyName")?.requirement;
    const personal = model.ui.fields.get("personalName")?.requirement;
    expect(company?.status).toBe("conditional");
    expect(personal?.status).toBe("conditional");
    expect(model.ui.fields.get("companyName")).not.toHaveProperty("required");
    expect(model.validation.validators).toEqual([]);

    const ifPlan = model.schemaDynamics.plans.find((plan) => plan.kind === "if");
    const thenSource = ifPlan?.branches.find((branch) => branch.id.endsWith(":then"))?.schemaPath;
    const elseSource = ifPlan?.branches.find((branch) => branch.id.endsWith(":else"))?.schemaPath;
    expect(company?.activationSources).toEqual([thenSource]);
    expect(personal?.activationSources).toEqual([elseSource]);

    const thenActive = new Set<SchemaPath>(thenSource === undefined ? [] : [thenSource]);
    expect(effectiveRequired(company, thenActive)).toBe(true);
    expect(effectiveRequired(personal, thenActive)).toBe(false);

    const elseActive = new Set<SchemaPath>(elseSource === undefined ? [] : [elseSource]);
    expect(effectiveRequired(company, elseActive)).toBe(false);
    expect(effectiveRequired(personal, elseActive)).toBe(true);
  });
});
