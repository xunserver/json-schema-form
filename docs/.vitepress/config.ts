import { defineConfig } from "vitepress";

function normalizeBase(value: string): string {
  const trimmed = value.trim();
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const base = normalizeBase(process.env.DOCS_BASE ?? "/json-schema-form/");

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
      { text: "指南", link: "/guide/getting-started" },
      { text: "Vue", link: "/vue/renderer" },
      { text: "React", link: "/react/renderer" },
      { text: "Playground", link: "/playground/" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "指南",
          items: [
            { text: "快速开始", link: "/guide/getting-started" },
            { text: "Form Definition", link: "/guide/definition" },
            { text: "编译", link: "/guide/compile" },
            { text: "Runtime", link: "/guide/runtime" },
            { text: "Validation", link: "/guide/validation" },
            { text: "Plugin 与扩展", link: "/guide/plugins" },
            { text: "数组身份", link: "/guide/arrays" },
            { text: "Playground", link: "/guide/playground" },
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
