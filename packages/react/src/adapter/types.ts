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
import type { ReactNode } from "react";
import type { ProtocolCompatibility, ProtocolVersion } from "./protocol.js";

export type ReactRegistryKind = "widgets" | "layouts";

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
  readonly control: ReactNode;
}

export interface FormAdapterRenderInput {
  readonly ids: { readonly form: string };
  readonly submit: () => void;
  readonly content: ReactNode;
}

export interface LayoutRenderInput {
  readonly view: ObjectView | ArrayView | GroupView | LayoutView;
  readonly viewSnapshot: ViewSnapshot;
  readonly children: readonly ReactNode[];
  readonly actions: LayoutSemanticActions;
  readonly reportDiagnostic: (diagnostic: Diagnostic) => void;
}

export interface WidgetBinding {
  readonly codec: ValueCodec;
  readonly mapProps?: (input: WidgetRenderInput) => Readonly<Record<string, unknown>>;
  readonly render: (input: WidgetRenderInput) => ReactNode;
  readonly capabilities?: WidgetCapabilities;
  readonly interaction: WidgetInteractionContract;
  readonly custom?: boolean;
}

export interface LayoutBinding {
  readonly render: (input: LayoutRenderInput) => ReactNode;
  readonly tabs?: readonly string[];
  readonly collapsible?: boolean;
}

export interface FormAdapter {
  readonly render: (input: FormAdapterRenderInput) => ReactNode;
}

export interface FieldChromeAdapter {
  readonly render: (input: FieldChromeRenderInput) => ReactNode;
}

export interface ReactUIAdapter {
  readonly id: string;
  readonly protocol: ProtocolCompatibility;
  readonly form: FormAdapter;
  readonly fieldChrome: FieldChromeAdapter;
  readonly widgets: Readonly<Record<string, WidgetBinding>>;
  readonly layouts: Readonly<Record<string, LayoutBinding>>;
}

export interface ReactAdapterContribution {
  readonly owner: string;
  readonly adapterId: string;
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}

export interface ReactRegistryOverride {
  readonly adapterId: string;
  readonly registry: ReactRegistryKind;
  readonly key: string;
  readonly expectedOwner: string;
  readonly replacementOwner: string;
}

export interface ReactRegistryEntryInspection<T> {
  readonly key: string;
  readonly owner: string;
  readonly adapterId: string;
  readonly registry: ReactRegistryKind;
  readonly value: T;
}

export interface ReactRegistry<T> {
  readonly size: number;
  has(key: string): boolean;
  get(key: string): T | undefined;
  keys(): IterableIterator<string>;
  values(): IterableIterator<T>;
  entries(): IterableIterator<readonly [string, T]>;
  inspect(key: string): ReactRegistryEntryInspection<T> | undefined;
  inspectAll(): readonly ReactRegistryEntryInspection<T>[];
  [Symbol.iterator](): IterableIterator<readonly [string, T]>;
}

export interface ResolvedReactAdapter {
  readonly id: string;
  readonly protocol: ProtocolVersion;
  readonly form: FormAdapter;
  readonly fieldChrome: FieldChromeAdapter;
  readonly widgets: ReactRegistry<WidgetBinding>;
  readonly layouts: ReactRegistry<LayoutBinding>;
}

export interface ReactRendererEnvironment {
  readonly protocol: ProtocolVersion;
  readonly adapterIds: readonly string[];
  getAdapter(id: string): ResolvedReactAdapter | undefined;
  inspect(
    adapterId: string,
    registry: ReactRegistryKind,
    key: string,
  ): ReactRegistryEntryInspection<WidgetBinding | LayoutBinding> | undefined;
}

export interface CreateReactRendererEnvironmentOptions {
  readonly adapters: readonly ReactUIAdapter[];
  readonly contributions?: readonly ReactAdapterContribution[];
  readonly overrides?: readonly ReactRegistryOverride[];
}

export interface AdapterDiagnosticObserver {
  (diagnostic: Diagnostic): void;
}

export type { ViewNode };
