import type { ViewNodeKind } from "@form/core";
import type { Component } from "vue";

export const viewRenderers: Partial<Record<ViewNodeKind, Component>> = {};
