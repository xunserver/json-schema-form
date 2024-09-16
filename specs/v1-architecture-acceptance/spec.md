# v1-architecture-acceptance Specification

## Purpose

为 JSON Schema Form Engine 的首个可用版本提供可重复、可审计且可机器判定的架构验收门禁，把既有 capability 契约与跨包运行证据关联起来，并防止遗漏、静默降级或验收层擅自补定义产品行为。

## Requirements

### Requirement: v1 架构覆盖矩阵完整且引用可解析
仓库必须（SHALL）维护版本化、机器可读取的 v1 架构覆盖矩阵。矩阵必须（MUST）分别完整登记 `docs/architecture.md` 第 3 节的 12 条不变量、第 20 节的 10 个首期垂直切片、第 21 节的 8 条验收标准，并登记第 16–20 节定义的 package、目录、公开 export、Diagnostic source 与明确延后项。每个需要正向交付的条目必须（MUST）引用非本 capability 的 owning change、capability、Requirement、至少一个 Scenario，以及稳定 test ID、测试文件和可执行命令；延后或可选条目必须（MUST）引用其明确的缺席/拒绝证据。未知、重复、悬空或仅以说明文字代替测试的映射必须（MUST）使门禁失败。

#### Scenario: 完整矩阵解析全部架构目录
- **GIVEN** 矩阵包含全部规定分类，且每个 owner、Requirement、Scenario、test ID、文件和命令都可解析
- **WHEN** 运行 v1 traceability 检查
- **THEN** 检查确认 12 条不变量、10 个切片、8 条标准及 package/目录/export/diagnostic/deferred 目录均无遗漏且无重复

#### Scenario: 悬空 owner 或 test 映射阻断验收
- **GIVEN** 任一条目引用不存在的 change、capability、Requirement、Scenario、测试文件或 test ID
- **WHEN** 运行 v1 traceability 检查
- **THEN** 门禁以失败状态退出并报告条目 ID 与悬空引用，不能用本验收 capability 自行充当缺失产品行为的 owner

### Requirement: 未解决的前序契约缺口阻断产品验收
v1 门禁必须（MUST）在运行跨栈产品验收前检查版本化 prerequisite 清单；每个 prerequisite 必须（MUST）指向负责修复的前序 owner、预期 capability/公共入口和证明其已解决的 contract test。状态仍为 unresolved、没有 owner 或没有可执行证据的 prerequisite 必须（MUST）阻断通过。本 capability 不得（MUST NOT）借 fixture、shim、deep import 或测试专用 writer 定义或替代缺失的产品契约。

#### Scenario: unresolved prerequisite 提前失败
- **GIVEN** prerequisite 清单仍有一项缺少 owning spec 或公开 contract test
- **WHEN** 运行 v1 gate
- **THEN** gate 在依赖该契约的跨 framework 场景前失败并列出 owner 缺口，不执行伪造该能力的 fallback

#### Scenario: owner 修复后使用公开入口验收
- **GIVEN** 所有 prerequisite 都能解析到前序 owning Scenario 与通过的公开 consumer contract
- **WHEN** v1 gate 继续执行集成场景
- **THEN** 验收只从批准的 package exports 消费这些契约，且不访问 owning package 的内部模块

### Requirement: 同一 Definition 与业务 Plugin 在两条渲染链路复用
跨 framework 验收必须（MUST）让同一份 `FormDefinition` 与同一组 framework-neutral 业务 Plugin 在 Vue/Element Plus 和 React/MUI 两条完整链路分别 compile、instantiate 和 render。两条链路必须（MUST）在等价的输入与公开语义操作后得到等价的 canonical values、`ArrayItemId` 身份关系、effective/presentable snapshots、validation 结果、serialization payload 与 submit 结果；允许 framework DOM 结构不同，但不得（MUST NOT）共享 Renderer 实现、创建 Universal Renderer 或把 framework component 放入 Core Plugin。

#### Scenario: 两个 framework 产生等价业务结果
- **GIVEN** 一个含 custom logical Widget、nested array、State/Computed Rule、Schema/async/server validation 与 conditional branch 的共享 Definition 和业务 Plugin
- **WHEN** 两条 renderer 链路按相同语义步骤完成输入、blur、array move、validate 与 submit
- **THEN** 两边的 Core 可观察业务结果等价，且各自只使用自己的 RendererEnvironment 与 UI Adapter

#### Scenario: 跨 framework 实现耦合被拒绝
- **GIVEN** React/MUI 验收代码导入 Vue/Element Plus 协议，或任一 framework 包试图注册 Universal Renderer
- **WHEN** 运行 import、declaration 与 matrix boundary 检查
- **THEN** v1 gate 失败并定位违规依赖，不能以共享 UI 实现换取结果一致

### Requirement: Core 可移植性与编译生命周期均有可执行证据
v1 gate 必须（MUST）证明 `@form/core` 在 Browser、Node.js、SSR、Web Worker 和 test 环境可导入并执行适用的 Definition、compile、instantiate 与 readonly inspection 路径，且其生产依赖、源码和公开 declaration 不包含 Vue、React、DOM、UI library 或 AJV。相同 Definition 与 frozen Environment 的编译结果必须（MUST）具有可重复 inspection/cache 语义；从同一不可变 Model 创建的多个 `FormInstance` 必须（MUST）保持 values、source state、array identity、validation generations、version 与 subscriptions 隔离。

#### Scenario: 五类宿主环境加载 Core
- **GIVEN** 分别代表 Browser、Node.js、SSR、Web Worker 与 test 的公开入口 fixtures
- **WHEN** 构建并运行各环境适用的 Core smoke/contract tests
- **THEN** 全部无需 framework、DOM UI library 或 AJV 即可完成，且依赖/declaration 扫描没有禁用类型或 import

#### Scenario: Model 可复用而实例状态隔离
- **GIVEN** 同一 Definition 与 Environment 重复编译并从一个结果创建两个 FormInstance
- **WHEN** 其中一个实例执行 value、array、interaction、Rule 与 validation 状态变化
- **THEN** 编译模型保持不可变且可 inspection/cache，另一个实例的全部 Runtime 状态与通知保持独立

### Requirement: 状态身份、事务稳定性与订阅精度跨层成立
v1 集成验收必须（MUST）同时证明：array move 后同一业务 item 的 touched、direct/aggregate errors、validating 与 View state 跟随 `ArrayItemId`；Rule/Validation 只读取当前 transaction 稳定后的 draft；外部 subscriber 看不到中间态；单 Field 更新不重新求值或通知无关 selector，也不使两条 framework renderer 的无关叶节点重渲染。验收必须（MUST）使用 owning capability 的公开 commands、selectors、hooks/composables 和记录型 adapter，不得（MUST NOT）通过内部 Store 直接准备结果。

#### Scenario: move 保留实体状态而更新地址
- **GIVEN** 一个 touched、focused、带 error 且有 pending validation 的 array item，以及同数组的无关 sibling
- **WHEN** 通过 `ArrayInstance.move()` 重排该 item
- **THEN** 状态与 component identity 继续属于原 `ArrayItemId`、公开 `InstancePath` 更新，旧 index 和 sibling 不继承其状态

#### Scenario: 单字段 transaction 只发布稳定受影响结果
- **GIVEN** 一个 Field 变化会触发 Computed Rule 与同步 Validation，并分别记录 Core selector、Vue render 与 React render 次数
- **WHEN** 通过公开 `setValue()` 提交变化
- **THEN** Rule/Validation 观察稳定顺序、外部只收到最终 commit，且无关 Field selector与两边叶节点不重新求值或重渲染

### Requirement: UI Adapter 不能绕过 semantic command 边界
v1 gate 必须（MUST）以标准 Adapter、记录型 headless Adapter 和 custom render escape hatch 验证所有 canonical value、touch、focus、blur、array 与 submit 交互只能进入受支持的 Runtime semantic API。Native event、UI library model/validation、protected props 或 custom render context 不得（MUST NOT）取得 values/error writer、TransactionManager、Runtime internal 或直接产生未提交状态；非法 codec/mapper/capability 输入必须（MUST）在 mutation 前失败。

#### Scenario: native 与 custom 交互都只能调用语义端口
- **GIVEN** 标准 Widget 与 custom Widget 分别产生合法输入、focus 和 blur
- **WHEN** headless recorder 与两个 UI library integration 处理交互
- **THEN** 只记录对应公开 semantic command及其 transaction 结果，native event/component instance 不进入 Core values 或上下文

#### Scenario: protected prop 与非法 codec 无部分写入
- **GIVEN** native options 尝试替换 controlled handler，且另一个 Widget 输出非法 canonical value
- **WHEN** Adapter preflight 或 codec 执行
- **THEN** 返回结构化 adapter failure，values、errors、version 与 subscriber 状态均无部分改变

### Requirement: 不支持能力在正确层产生结构化 Diagnostic
v1 gate 必须（MUST）覆盖 `schema`、`compiler`、`plugin`、`adapter` 与 `runtime` 五种 `Diagnostic.source`，并至少触发 unsupported schema generation、缺失/incompatible Widget、Validator/Rule reference 或 cycle、Plugin conflict/protocol、Adapter capability/codec 以及非法 Runtime path/array/effect 情况。每个结果必须（MUST）具有稳定 code、severity、message、适用位置与安全 readonly metadata，且不得（MUST NOT）依赖 silent fallback、泄漏 provider exception、业务 values 或内部 ID。

#### Scenario: 五类 source 均可定位且无静默 fallback
- **GIVEN** 诊断矩阵为五个 source 分别提供合法 fault fixture
- **WHEN** 执行 compile、environment build、adapter preflight 与 Runtime command
- **THEN** 每个失败由正确 source 的稳定 Diagnostic 表达，并能映射回 owning Scenario和test ID

#### Scenario: 诊断 redaction 与确定顺序可重复
- **GIVEN** 一次输入同时触发多个可安全聚合的问题且 provider 内部抛出敏感异常
- **WHEN** 重复执行对应验收
- **THEN** diagnostics 顺序和公开 metadata 语义稳定，并且不包含原异常对象、完整业务值、mutable Registry 或 RuntimeNodeId

### Requirement: 公开 API 路径与延后能力的缺席同样受验证
v1 gate 必须（MUST）通过 consumer fixtures 验证 default Environment、显式 Environment 与 `FormEngine` 三条路径，以及架构第 16 节列出的 `FormInstance` facade 均可从其 owning 公开入口组合使用；Application、Advanced Runtime 与 Extension exports 必须（MUST）保持角色隔离，未声明 deep import 必须失败。架构第 20 节明确延后的能力及其他明确未认领的可选语法不得（MUST NOT）被文档、export、依赖或运行时 fallback 暗示为已交付，并必须（MUST）具有可执行的 absence/unsupported 证据。

#### Scenario: 三条生命周期路径与全部 FormInstance facade 可组合
- **GIVEN** 仅从批准的 Core root、runtime 与 extension 入口编译 consumer fixture
- **WHEN** fixture分别使用 default、explicit Environment、Engine，并调用架构列出的 FormInstance/Field/Array/Scope/validation/serialization/submit 契约
- **THEN** 正向类型与运行测试通过，角色错误 import 和 internal deep import 失败

#### Scenario: 延后能力保持缺席
- **GIVEN** consumer尝试使用任意 runtime Model mutation、async Rule、内置 remote DataSource、任意 lifecycle hook、独立 nested Store、mutable DevTools graph、独立 compiler/runtime package或未提供的 UI Adapter
- **WHEN** 运行类型、export、dependency、文档与运行期 capability 检查
- **THEN** 能力不可用或产生明确 unsupported Diagnostic，v1 文档与 examples 不宣称其存在

### Requirement: v1 验收结果可重复并形成结构化 evidence
仓库必须（SHALL）提供一个从干净 checkout 可重复运行的 v1 gate。Gate 必须（MUST）汇总 traceability、typecheck、build、unit、contract、integration、boundary、declaration/export、SSR/hydration 和 example 检查，并输出包含 matrix schema version、被执行 test IDs、结果与关键工具版本的结构化 evidence。任一 prerequisite、矩阵引用、命令或测试失败必须（MUST）使进程非零退出，且不得（MUST NOT）发布陈旧或 partial 的通过证据。

#### Scenario: 干净 checkout 生成完整通过证据
- **GIVEN** 前序 owners 均已交付、lockfile完整且所有矩阵引用有效
- **WHEN** 在受支持工具链运行单一 v1 gate
- **THEN** gate执行全部分类并原子产生可检查的通过 evidence，重复运行得到语义等价的覆盖清单

#### Scenario: 中途失败不留下通过证据
- **GIVEN** SSR、example、boundary或任一映射测试失败
- **WHEN** v1 gate执行到该检查
- **THEN** 命令非零退出、报告失败test ID与命令，且不存在声称整个v1已通过的partial/stale evidence
