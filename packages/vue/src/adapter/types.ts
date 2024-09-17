import type {
  ArrayView,
  Diagnostic,
  FieldDescriptor,
  FieldSnapshot,
  FieldView,
  GroupView,
  JsonValue,
  LayoutView,
  ObjectView,
  ValidationError,
  ViewNode,
  ViewSnapshot,
} from "@xunserver-jsf/core";
import type { RenderScope } from "@xunserver-jsf/core/runtime";
import type { WidgetCapabilities, WidgetInteractionContract } from "@xunserver-jsf/core/extension";
import type { VNode } from "vue";
import type { ProtocolCompatibility, ProtocolVersion } from "./protocol.js";

export type VueRegistryKind = "widgets" | "layouts";

export type LayoutKind = "object" | "array" | "group" | "layout";

export interface CodecSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface CodecFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

export type CodecResult<T> = CodecSuccess<T> | CodecFailure;

export interface ValueCodec<Canonical = JsonValue | undefined, Native = unknown> {
  encode(canonical: Canonical): Native;
  decode(native: unknown): CodecResult<Canonical>;
}

export interface SemanticActions {
  readonly setValue: (canonicalValue: unknown) => void;
  readonly touch: () => void;
  readonly focus: () => void;
  readonly blur: () => void;
}

export interface LayoutSemanticActions {
  readonly setCollapsed: (collapsed: boolean) => void;
  readonly setActiveTab: (tabKey: string | null) => void;
}

export interface FieldDomIds {
  readonly prefix: string;
  readonly control: string;
  readonly label: string;
  readonly help: string;
  readonly errors: readonly string[];
}

export interface WidgetRenderInput {
  readonly field: FieldDescriptor;
  readonly view: FieldView;
  readonly scope: RenderScope;
  readonly value: JsonValue | undefined;
  readonly fieldSnapshot: FieldSnapshot;
  readonly viewSnapshot: ViewSnapshot;
  readonly presentableErrors: readonly ValidationError[];
  readonly ids: FieldDomIds;
  readonly nativeProps: Readonly<Record<string, unknown>>;
  readonly actions: SemanticActions;
  readonly reportDiagnostic: (diagnostic: Diagnostic) => void;
}

export interface FieldChromeRenderInput {
  readonly field: FieldDescriptor;
  readonly view: FieldView;
  readonly fieldSnapshot: FieldSnapshot;
  readonly viewSnapshot: ViewSnapshot;
  readonly presentableErrors: readonly ValidationError[];
  readonly ids: FieldDomIds;
  readonly control: VNode | null;
}

export interface FormAdapterRenderInput {
  readonly ids: { readonly form: string };
  readonly submit: () => void;
  readonly content: VNode;
}

export interface LayoutRenderInput {
  readonly view: ObjectView | ArrayView | GroupView | LayoutView;
  readonly viewSnapshot: ViewSnapshot;
  readonly children: readonly VNode[];
  readonly actions: LayoutSemanticActions;
  readonly reportDiagnostic: (diagnostic: Diagnostic) => void;
}

export interface WidgetBinding {
  readonly codec: ValueCodec;
  readonly mapProps?: (input: WidgetRenderInput) => Readonly<Record<string, unknown>>;
  readonly render: (input: WidgetRenderInput) => VNode;
  readonly capabilities?: WidgetCapabilities;
  readonly interaction: WidgetInteractionContract;
  readonly custom?: boolean;
}

export interface LayoutBinding {
  readonly render: (input: LayoutRenderInput) => VNode;
  readonly tabs?: readonly string[];
  readonly collapsible?: boolean;
}

export interface FormAdapter {
  readonly render: (input: FormAdapterRenderInput) => VNode;
}

export interface FieldChromeAdapter {
  readonly render: (input: FieldChromeRenderInput) => VNode;
}

export interface VueUIAdapter {
  readonly id: string;
  readonly protocol: ProtocolCompatibility;
  readonly form: FormAdapter;
  readonly fieldChrome: FieldChromeAdapter;
  readonly widgets: Readonly<Record<string, WidgetBinding>>;
  readonly layouts: Readonly<Record<string, LayoutBinding>>;
}

export interface VueAdapterContribution {
  readonly owner: string;
  readonly adapterId: string;
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}

export interface VueRegistryOverride {
  readonly adapterId: string;
  readonly registry: VueRegistryKind;
  readonly key: string;
  readonly expectedOwner: string;
  readonly replacementOwner: string;
}

export interface VueRegistryEntryInspection<T> {
  readonly key: string;
  readonly owner: string;
  readonly adapterId: string;
  readonly registry: VueRegistryKind;
  readonly value: T;
}

export interface VueRegistry<T> {
  readonly size: number;
  has(key: string): boolean;
  get(key: string): T | undefined;
  keys(): IterableIterator<string>;
  values(): IterableIterator<T>;
  entries(): IterableIterator<readonly [string, T]>;
  inspect(key: string): VueRegistryEntryInspection<T> | undefined;
  inspectAll(): readonly VueRegistryEntryInspection<T>[];
  [Symbol.iterator](): IterableIterator<readonly [string, T]>;
}

export interface ResolvedVueAdapter {
  readonly id: string;
  readonly protocol: ProtocolVersion;
  readonly form: FormAdapter;
  readonly fieldChrome: FieldChromeAdapter;
  readonly widgets: VueRegistry<WidgetBinding>;
  readonly layouts: VueRegistry<LayoutBinding>;
}

export interface VueRendererEnvironment {
  readonly protocol: ProtocolVersion;
  readonly adapterIds: readonly string[];
  getAdapter(id: string): ResolvedVueAdapter | undefined;
  inspect(
    adapterId: string,
    registry: VueRegistryKind,
    key: string,
  ): VueRegistryEntryInspection<WidgetBinding | LayoutBinding> | undefined;
}

export interface CreateVueRendererEnvironmentOptions {
  readonly adapters: readonly VueUIAdapter[];
  readonly contributions?: readonly VueAdapterContribution[];
  readonly overrides?: readonly VueRegistryOverride[];
}

export interface AdapterDiagnosticObserver {
  (diagnostic: Diagnostic): void;
}

export type { ViewNode };
