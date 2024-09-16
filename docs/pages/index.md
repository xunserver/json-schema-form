---
layout: home
hero:
  name: JSON Schema Form
  text: 以 JSON Schema 为数据契约的表单引擎
  tagline: define → compile → create → render。同一份 Form Definition 可同时驱动 Vue 与 React。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 打开 Playground
      link: /playground/
features:
  - title: 框架无关的 Core
    details: Core 负责 Definition、静态编译、事务 Runtime 与 Validation，不依赖 Vue、React、DOM 或 AJV。
  - title: 双栈 Renderer
    details: Vue 与 React Renderer 只消费已解析的 ViewTree 与 effective snapshot，不解释 Schema 或 Rule。
  - title: 可替换 UI Adapter
    details: Element Plus、Ant Design、Arco Vue、Arco React 作为叶子 Adapter，宿主库只出现在 peer dependency。
---
