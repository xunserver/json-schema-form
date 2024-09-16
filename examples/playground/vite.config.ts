import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    react({ include: /\.[jt]sx$/ }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(root, "index.html"),
        "element-plus": path.resolve(root, "element-plus.html"),
        antd: path.resolve(root, "antd.html"),
        "arco-vue": path.resolve(root, "arco-vue.html"),
        "arco-react": path.resolve(root, "arco-react.html"),
        shadcn: path.resolve(root, "shadcn.html"),
      },
    },
  },
  optimizeDeps: {
    include: [
      "antd",
      "@arco-design/web-react",
      "@arco-design/web-vue",
      "element-plus",
      "react",
      "react-dom",
      "vue",
      "monaco-editor",
    ],
  },
});
