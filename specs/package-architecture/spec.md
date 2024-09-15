# package-architecture Specification

## Purpose

定义可安装的工作区单元与可强制执行的依赖边界，使表单引擎能够跨框架、Renderer、Validator 和非 DOM 环境保持可移植性。

## Requirements

### Requirement: 首期工作区 package
工作区必须（SHALL）以一个 pnpm/TypeScript monorepo 管理并暴露可构建的 `@form/core`、`@form/validator-ajv`、`@form/vue`、`@form/react`、`@form/element-plus` 和 `@form/mui` package。

#### Scenario: 发现全部首期 package
- **GIVEN** 一个已安装工作区依赖的干净 checkout
- **WHEN** pnpm 枚举工作区并运行仓库构建和类型检查命令
- **THEN** 系统发现全部六个首期 package，且每个 package 均能通过其声明的空公共边界完成检查

#### Scenario: 解析 package 局部 TypeScript 配置
- **GIVEN** 任意一个首期 package
- **WHEN** 独立检查其 TypeScript project
- **THEN** 该 project 继承共享编译契约，并且只解析该 package 显式声明的输入

### Requirement: Package 依赖方向
Package 元数据和源码 import 只允许以下产品依赖边（SHALL）：`@form/validator-ajv` 指向 `@form/core`，`@form/vue` 指向 `@form/core`，`@form/react` 指向 `@form/core`，`@form/element-plus` 指向 `@form/vue` 与 `@form/core`，`@form/mui` 指向 `@form/react` 与 `@form/core`。任何首期 package 都不得（SHALL NOT）引入反向或跨框架产品依赖。

#### Scenario: 接受合法依赖图
- **GIVEN** manifest 和 import 只包含允许的产品依赖边
- **WHEN** 运行 package 边界检查
- **THEN** 依赖图通过检查

#### Scenario: 拒绝反向依赖
- **GIVEN** `@form/core` 从 `@form/vue` 导入内容或将其声明为依赖
- **WHEN** 运行 package 边界检查
- **THEN** 检查失败，并指出违规的源 package 和目标 package

#### Scenario: 拒绝跨框架 Adapter 依赖
- **GIVEN** `@form/mui` 依赖 `@form/vue` 或 `@form/element-plus`
- **WHEN** 运行 package 边界检查
- **THEN** 检查失败，并指出不受支持的依赖边

### Requirement: 框架宿主使用 peer dependency
框架集成 package 必须（SHALL）将宿主框架和 UI library 要求表达为 peer dependency；工作区内的 `@form/*` 关系必须遵循允许的产品依赖图。

#### Scenario: 检查框架 package manifest
- **GIVEN** 六个首期 package manifest
- **WHEN** 校验依赖策略
- **THEN** Vue、React、Element Plus 和 MUI 宿主要求出现在对应集成 package 的 peer dependency 中

#### Scenario: 拒绝打包宿主框架
- **GIVEN** 某框架集成 package 将其宿主框架或 UI library 放入会被打包的生产依赖
- **WHEN** 校验依赖策略
- **THEN** 检查失败，并指出相关 package 和放置错误的依赖

### Requirement: Core 独立于框架、DOM、UI library 和 AJV
`@form/core` 必须（SHALL）能够在其依赖图和源码 import 图不包含 Vue、React、DOM 类型库、具体 UI library 或 AJV 的情况下完成构建和类型检查。

#### Scenario: 在非 DOM 环境验证 Core
- **GIVEN** Core TypeScript project 使用 ECMAScript library 且不包含 DOM library
- **WHEN** 构建 Core 并执行类型检查
- **THEN** 检查成功，且无需解析浏览器全局对象或框架、UI library、AJV 类型

#### Scenario: 检测 Core 禁止 import
- **GIVEN** Core 源文件导入 Vue、React、AJV、Element Plus、MUI 或 DOM-only API
- **WHEN** 运行 Core 独立性检查
- **THEN** 至少一项检查失败，并指出禁止依赖或不可用的 DOM 契约

### Requirement: 仓库验证包含边界检查
仓库必须（SHALL）提供可重复运行的验证命令，从干净 checkout 检查 manifest、源码依赖方向、Core 独立性、package 构建、类型正确性和边界契约测试。

#### Scenario: 验证未修改的合规工作区
- **GIVEN** 一个所有 package 均符合声明边界的干净 checkout
- **WHEN** 运行仓库验证命令
- **THEN** 所有架构与 package 契约检查均通过，且不要求存在应用示例

#### Scenario: 报告可操作的边界错误
- **GIVEN** 存在 manifest、import 或编译器 library 违规
- **WHEN** 运行仓库验证
- **THEN** 命令以失败状态退出，并报告足以定位问题的 package 和规则信息

### Requirement: AJV具体依赖与实现只属于validator package
`@form/validator-ajv`必须（SHALL）作为`@form/core` Validator Adapter协议的叶子实现持有AJV生产依赖，并且只能沿既有`@form/validator-ajv -> @form/core`产品依赖边消费公共契约。`@form/core`及Vue、React、Element Plus、MUI package不得（MUST NOT）直接依赖、导入或在公共declaration中引用AJV类型；Core validation行为必须（MUST）在没有AJV package时仍可构建和类型检查。

#### Scenario: validator-ajv合法依赖AJV与Core
- **GIVEN** `@form/validator-ajv` manifest声明AJV和`@form/core`，源码只从Core受支持入口导入协议
- **WHEN** 运行workspace build、typecheck和boundary checks
- **THEN** package成功构建且既有产品依赖方向保持不变

#### Scenario: 拒绝Core或Renderer导入AJV
- **GIVEN** Core或任一framework/UI package直接import AJV或在公共类型中暴露AJV `ErrorObject`
- **WHEN** 运行Core independence、declaration和architecture checks
- **THEN** 检查失败并指出违规package、import或declaration边界
