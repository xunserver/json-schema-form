// @ts-expect-error Advanced selector factories are not part of the public root barrel
import { valueSelector } from "../src/index.js";
// @ts-expect-error RenderScope is not part of the public root barrel
import type { RenderScope } from "../src/index.js";
// @ts-expect-error InstanceBinding is not part of the public root barrel
import type { InstanceBinding } from "../src/index.js";
// @ts-expect-error getRenderScope is not part of the public root barrel
import { getRenderScope } from "../src/index.js";

void valueSelector;
void 0 as unknown as RenderScope;
void 0 as unknown as InstanceBinding;
void getRenderScope;
