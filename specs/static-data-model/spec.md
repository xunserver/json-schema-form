# static-data-model Specification

## Purpose

定义从有效 Schema shape 产生的不可变 Data Tree，使后续 Runtime、Rule、Validation 与 Renderer 能以稳定 ModelPath 和 DataNodeId 检查同一静态数据结构，而不混入实例地址或状态。

## Requirements

### Requirement: Data Tree 按结构位置实例化稳定节点
`DataModel` 必须（SHALL）包含一个 root 与按 canonical `ModelPath` 索引的只读节点集合。每个 DataNode 必须（MUST）具有唯一且确定的 `DataNodeId`、`ModelPath`、kind 和可追溯 `schemaRef`；相同 Definition 与 Environment 的重复编译必须（MUST）保持这些 ID、Path 与遍历顺序语义一致。

#### Scenario: 共享 Schema 产生不同位置节点
- **GIVEN** `billingAddress` 和 `shippingAddress` 引用同一个 Schema Graph target
- **WHEN** 编译 DataModel
- **THEN** 两者拥有不同的 `ModelPath` 与 `DataNodeId`，同时保留指向共享 Schema 来源的引用信息

#### Scenario: Path 与 ID 保持不同语义
- **GIVEN** 下游检查任意 DataNode
- **WHEN** 比较其 `ModelPath` 与 `DataNodeId`
- **THEN** Path 表示结构位置而 ID 表示实体，二者不会被一个通用字符串字段替代

### Requirement: Object 节点保留 property edge 与声明顺序
Object DataNode 必须（SHALL）按确定的有效 properties 顺序暴露 child edge；`required` 必须（MUST）属于 property edge，并区分始终 required、optional 与由 conditional 决定的状态，不得（MUST NOT）成为 child DataNode 的 intrinsic 状态。

#### Scenario: 编译 required property
- **GIVEN** Object Schema 按顺序声明 `name` 与 `age`，且仅 `name` 出现在 `required`
- **WHEN** 编译 DataModel
- **THEN** Object edge 保持声明顺序，`name` edge 标记为 required，两个 child node 本身不复制 required 标记

#### Scenario: 合并组合来源的同一 property
- **GIVEN** 多个结构分支在同一 ModelPath 声明同名 property
- **WHEN** 构建 static Data Tree
- **THEN** 该位置只有一个可寻址节点，并以 Union/conditional provenance 保留差异，而不是创建冲突的重复 map key

### Requirement: Array 节点区分 list template 与 tuple slot
Array DataNode 必须（SHALL）区分由 `items` 描述的 list item template 和由 `prefixItems` 描述的 tuple slots，并为每个静态模板提供不冒充 `InstancePath` 的 canonical `ModelPath`。Compiled Model 不得（MUST NOT）创建运行时数组项、使用当前 index 作为身份或包含 `ArrayItemId` sidecar。

#### Scenario: 编译 list item template
- **GIVEN** `products` 是 items 为 Object 的 list Schema
- **WHEN** 编译 DataModel
- **THEN** 产生 `products[]` 模板及其 `products[].name` descendant，而不产生 `products[0]` 实例节点

#### Scenario: 编译 tuple slots
- **GIVEN** Array Schema 声明多个 `prefixItems`
- **WHEN** 编译 DataModel
- **THEN** 每个 slot 具有确定且不同的静态模板位置，且这些位置不表示任何 Runtime `ArrayItemId`

### Requirement: Recursive reference 形成有限 Data Tree
当 reference graph 的遍历返回当前结构 ancestry 时，DataModel 必须（MUST）使用可解析目标的 `RecursiveDataRef` 截断无限展开。非递归共享引用必须（MUST）继续按结构位置实例化；递归 Runtime 实例的按需 materialization 不属于 Compiled Model。

#### Scenario: 编译递归目录 Schema
- **GIVEN** 一个 category Schema 的 children items 递归引用 category
- **WHEN** 编译 DataModel
- **THEN** Data Tree 在递归边产生指向 category template 的 `RecursiveDataRef`，节点总数有限且诊断遍历终止

#### Scenario: 不把普通共享引用误判为递归
- **GIVEN** 两个 sibling properties 引用同一非递归 address Schema
- **WHEN** 编译 DataModel
- **THEN** 两个结构位置分别实例化完整 child tree，而不是用 `RecursiveDataRef` 替代第二处

### Requirement: Conditional 结构编译为静态并集
有限 `oneOf`、`anyOf`、`if/then/else` 与 `dependentSchemas` 引入的所有可能结构位置必须（MUST）存在于 immutable DataModel static superset 中，并带足以追踪 branch Schema 来源的静态信息。当前变更不得（MUST NOT）计算实例级 `active`、删除 inactive node 或在 Runtime branch 切换时修改 DataModel。

#### Scenario: 条件分支引入不同字段
- **GIVEN** then 与 else 分支分别引入 `companyName` 和 `personalName`
- **WHEN** 编译 DataModel
- **THEN** 两个 ModelPath 都可在静态节点集合中检查，且没有字段被预先宣称为当前 Runtime active

#### Scenario: 分支同路径具有不同 shape
- **GIVEN** union 分支对同一 property 声明不同 scalar 类型
- **WHEN** 编译 DataModel
- **THEN** 该 property 表示为一个保留各候选来源的 Union node，而不是按编译顺序覆盖

### Requirement: DataModel 与 Runtime state 严格分离
DataModel 及其 node、edge、source 与 collection view 必须（MUST）运行时不可变，并且不得（MUST NOT）包含 values、`InstancePath`、ArrayItemId order、touched/errors、Runtime activation 或 mutation API。

#### Scenario: 从同一模型创建实例的前置隔离
- **GIVEN** 下游未来从同一 `CompiledFormModel` 创建多个 `FormInstance`
- **WHEN** 检查静态 DataModel
- **THEN** 其中不存在可被任一实例改写的 value、state 或 array identity 内容

