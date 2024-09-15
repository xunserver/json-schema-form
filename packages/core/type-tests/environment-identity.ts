import { compileForm, createForm, defineForm } from "../src/index.js";
import { createFormEnvironment } from "../src/extension/index.js";
import { peekEnvironmentIdentity } from "../src/engine/environment-identity.js";

const environment = createFormEnvironment();
const identity = peekEnvironmentIdentity(environment);
void identity;

const { model } = compileForm(
  defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }),
  { environment },
);
const form = createForm(model, { environment });
void form.getState().version;

type EnvironmentKeys = keyof typeof environment;
type Forbidden = Extract<EnvironmentKeys, "token" | "identity" | "environmentIdentity" | "identityToken">;
type AssertHidden = Forbidden extends never ? true : never;
const hidden: AssertHidden = true;
void hidden;

// @ts-expect-error Environment identity token is not a public Environment field
environment.identityToken;
