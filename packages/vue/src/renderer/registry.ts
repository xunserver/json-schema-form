import type { ViewNodeKind } from "@xunserver-jsf/core";
import type { Component } from "vue";

export const viewRenderers: Partial<Record<ViewNodeKind, Component>> = {};
