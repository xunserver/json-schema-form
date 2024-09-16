import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";

function normalizeBase(value: string): string {
  const trimmed = value.trim();
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.DOCS_BASE ?? "/json-schema-form/");
const pagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../pages");

function loadApiSidebar(): unknown[] {
  const sidebarPath = path.join(pagesDir, "api/typedoc-sidebar.json");
  if (!fs.existsSync(sidebarPath)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(sidebarPath, "utf8")) as unknown;
  return stripSidebarMd(parsed) as unknown[];
}

function stripSidebarMd(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripSidebarMd);
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const next: Record<string, unknown> = { ...record };
    if (typeof next.link === "string") {
      next.link = next.link.replace(/\.md$/u, "");
    }
    if (Array.isArray(next.items)) {
      next.items = next.items.map(stripSidebarMd);
    }
    return next;
  }
  return node;
}

export default defineConfig({
  lang: "zh-CN",
  title: "JSON Schema Form",
  description: "以 JSON Schema 为数据契约的表单引擎",
  srcDir: "pages",
  cleanUrls: false,
  base,
  lastUpdated: false,
  themeConfig: {
    nav: [
      { text: "使用", link: "/guide/getting-started" },
      { text: "定制", link: "/customize/" },
      { text: "概念", link: "/concepts/lifecycle" },
      { text: "API", link: "/api/" },
      { text: "Vue", link: "/vue/renderer" },
      { text: "React", link: "/react/renderer" },
      { text: "Playground", link: "/playground/", target: "_top" },
      { text: "仓库", link: "https://github.com/xunserver/json-schema-form" },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/xunserver/json-schema-form" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "使用",
          items: [
            { text: "快速开始", link: "/guide/getting-started" },
            { text: "字段与外观", link: "/guide/fields" },
            { text: "布局", link: "/guide/layout" },
            { text: "校验与错误", link: "/guide/validation" },
            { text: "条件与计算", link: "/guide/rules" },
            { text: "数组", link: "/guide/arrays" },
            { text: "提交与序列化", link: "/guide/submit" },
            { text: "Playground", link: "/guide/playground" },
          ],
        },
      ],
      "/customize/": [
        {
          text: "定制",
          items: [
            { text: "选择层级", link: "/customize/" },
            { text: "Core Plugin", link: "/customize/plugin" },
            { text: "追加与覆盖 Widget", link: "/customize/override" },
            { text: "自建 Adapter", link: "/customize/adapter" },
          ],
        },
      ],
      "/concepts/": [
        {
          text: "概念",
          items: [
            { text: "生命周期与 Environment", link: "/concepts/lifecycle" },
            { text: "四份契约", link: "/concepts/contracts" },
            { text: "Path 与身份", link: "/concepts/path" },
            { text: "Widget 双层", link: "/concepts/widget" },
            { text: "Effective state", link: "/concepts/state" },
            { text: "Core 三入口", link: "/concepts/exports" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API",
          items: [
            { text: "如何阅读", link: "/api-overview" },
            ...((loadApiSidebar() as { text?: string; items?: unknown[] }[]) ?? []),
          ],
        },
      ],
      "/vue/": [
        {
          text: "Vue",
          items: [
            { text: "Renderer", link: "/vue/renderer" },
            { text: "Element Plus", link: "/vue/element-plus" },
            { text: "Arco Vue", link: "/vue/arco-vue" },
          ],
        },
      ],
      "/react/": [
        {
          text: "React",
          items: [
            { text: "Renderer", link: "/react/renderer" },
            { text: "Ant Design", link: "/react/antd" },
            { text: "Arco React", link: "/react/arco-react" },
            { text: "shadcn", link: "/react/shadcn" },
          ],
        },
      ],
    },
    outline: "deep",
    search: {
      provider: "local",
    },
  },
});
