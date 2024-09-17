# validation-pipeline Specification

## Purpose

为不可变Form Model与事务Runtime提供统一、可替换且身份稳定的validation pipeline，使Schema、同步/异步Custom、Validation Rule与Server errors能在同一只读状态契约中精确调度、聚合和提交，同时保持Core与具体validator及Renderer隔离。

## Requirements

### Requirement: 四类validation来源归一为readonly ValidationError
Core必须（SHALL）以统一`ValidationError`表示`schema`、`custom`、`async`和`server`来源。每条error必须（MUST）具有稳定`id`、`code`、`source`和目标`InstancePath`，并可以（MAY）包含`ModelPath`、message、keyword、readonly params、validatorId与`SchemaPath`；错误和嵌套metadata不得（MUST NOT）被公共消费者修改。Validation Rule产生的error归为`custom`并以Rule ID作为可检查owner，不得创造第五种来源。

#### Scenario: 四来源共享同一消费契约
- **GIVEN** 同一Form当前有Schema required、同步Custom、异步uniqueness和Server error
- **WHEN** Application或Renderer读取Form validation snapshot
- **THEN** 四条error都可通过相同readonly字段检查，source分别为`schema`、`custom`、`async`、`server`

#### Scenario: 等价结果保持稳定identity语义
- **GIVEN** 同一validator对同一runtime binding重复产生语义等价issue
- **WHEN** 结果被规范化并与当前owner error set比较
- **THEN** error ID、确定顺序与未变化snapshot引用保持稳定，不产生无意义version或subscription通知

### Requirement: errors归属DataNode并区分direct与descendant aggregation
每条effective error必须（MUST）挂到目标Runtime DataNode binding而不是FieldView。Node/Field/Form snapshot必须（MUST）分别提供目标节点的`directErrors`和按当前active descendant聚合的`errors`/`valid`；ancestor不得（MUST NOT）复制child errors为自己的direct source，多个FieldView也不得拥有彼此分叉的error真相。聚合顺序必须（MUST）按runtime data顺序、source与compiled plan顺序确定。

#### Scenario: child error只直接属于child node
- **GIVEN** `profile.name`存在一个direct custom error
- **WHEN** 分别读取name、profile与Form snapshots
- **THEN** name的directErrors包含该error，profile/Form的aggregate errors包含同一error，而profile directErrors不复制它

#### Scenario: 重复FieldView共享Field validation state
- **GIVEN** 同一Field由两个不同`ViewNodeId`呈现
- **WHEN** 该Field获得或清除ValidationError
- **THEN** 两个View消费同一Field/DataNode validation snapshot，不产生View-owned副本

### Requirement: ValidationModel编译四类只读执行计划
Compiler必须（MUST）从canonical Schema/source map、Form validation config、冻结Validator Registry及RuleModel的Validation Rule records生成immutable `ValidationModel`。Model必须（MUST）包含Schema、sync Custom、Async、Validation Rule与Server policy plans及按dependency/target的确定索引；Compiler必须校验adapter/provider key与kind、target/dependency `ModelPath`、automatic trigger、array/recursive scope和options shape。任一阻断问题必须（MUST）进入`CompileError`且不发布partial ValidationModel或callable provider。

#### Scenario: 编译Schema与named validator plans
- **GIVEN** Definition选择registered Schema Adapter并声明sync/async validator uses，RuleModel还含Validation Rule
- **WHEN** 执行`compileForm()`
- **THEN** ValidationModel按确定顺序保存Registry key/provenance、target、dependencies、trigger与Schema来源，但不保存AJV实例或provider callable

#### Scenario: 拒绝missing provider与非法scope
- **GIVEN** 一个use引用未注册key，另一个array target读取无法唯一绑定的sibling array dependency
- **WHEN** Compiler能安全发现两者
- **THEN** `CompileError`聚合稳定validation diagnostics且没有partial Model

#### Scenario: 未绑定Schema Adapter不静默视为已校验
- **GIVEN** Environment没有Schema Adapter且Definition未显式选择一个
- **WHEN** Compiler建立通用Schema plan
- **THEN** 产物携带可检查的unbound-adapter Diagnostic；任何需要Schema validation的Runtime调用结构化失败而不会把跳过当作valid validation result

### Requirement: Schema Validator Adapter以validateAll为正确性基线
Core Schema Validator Adapter协议必须（MUST）要求同步`validateAll`接收readonly完整instance与compiled Schema plan并返回readonly adapter issues。`validateAt`和`validateAffected`只能（MUST）在adapter同时实现method并显式声明对当前plan语义安全时作为优化；否则Core必须（MUST）回退到`validateAll`。优化结果必须（MUST）与相同snapshot的全量验证在受影响owner replacement语义上等价，Core不得假设JSON Schema关键字天然局部。

#### Scenario: 无incremental能力时全量验证
- **GIVEN** Adapter只提供`validateAll`且一个leaf value发生变化
- **WHEN** change trigger要求Schema validation
- **THEN** Core使用完整stable draft调用`validateAll`并原子替换本轮Schema owner errors

#### Scenario: 只使用声明安全的优化
- **GIVEN** Adapter实现`validateAffected`但未对当前Schema plan声明safe capability
- **WHEN** dependency change发生
- **THEN** Core忽略该method并使用`validateAll`，不会以性能优化改变error语义

### Requirement: validator-ajv实现Draft 2020-12并规范化AJV errors
`@xunserver-jsf/validator-ajv`必须（SHALL）提供可显式注册的Draft 2020-12 Schema Adapter factory，并只从`@xunserver-jsf/core/extension`消费公共协议。它必须（MUST）把AJV instancePath JSON Pointer、keyword、params、message与schemaPath转换为Core adapter issue；Core随后将其映射到合法Runtime binding、稳定code与`ValidationError`。`required` error必须（MUST）从object地址加missingProperty定位缺失child的`InstancePath`，同时保留readonly params与原`SchemaPath`。非法pointer、未知binding或malformed AJV result必须（MUST）产生结构化adapter Diagnostic，不得静默挂到相邻Field或泄漏AJV `ErrorObject`。

#### Scenario: 规范化required target
- **GIVEN** AJV在`/profile`对象上报告required且params.missingProperty为`name`
- **WHEN** Adapter规范化该issue
- **THEN** Core error定位`profile.name`的Runtime DataNode，code/keyword为稳定required语义并保留Schema path与readonly params

#### Scenario: 规范化escaped array path
- **GIVEN** AJV issue的JSON Pointer包含escaped property和数组index
- **WHEN** 转换到Core path并通过Array binding解析
- **THEN** error挂到当前item identity对应的精确DataNode，move后owner identity不因旧index改变

#### Scenario: AJV实现不泄漏到Core
- **GIVEN** 构建Core和`@xunserver-jsf/validator-ajv`生成declarations
- **WHEN** 检查依赖与公共类型
- **THEN** 只有validator package依赖AJV，Core声明和Schema Adapter协议中不存在AJV-specific类型

### Requirement: Sync Validation 在 Rule 稳定后消费受影响 plan
Sync Validation phase必须（MUST）在 activation 与 Rule/effect 稳定之后，消费 transaction-owned dependency scheduler 给出的受影响 Validation Rule plan binding，以及 Schema activation `false→true` 翻转所触及的 target。已有 `activationChanged` 防御检测可以（MAY）保留，但不得（MUST NOT）成为唯一触发 activation 重校验的路径。无关 sibling item 与未翻转的 inactive subtree 不得（MUST NOT）仅因同数组其它路径变化而重新跑 Validation Rule。

#### Scenario: activation翻转触发Validation plan
- **GIVEN** conditional branch 上的 custom Validation Rule 在 inactive 期间依赖值已改变
- **WHEN** Schema activation 使该 branch 重新 active 并完成本轮 Rule 稳定
- **THEN** sync Validation 对该 binding 执行并只发布最终错误快照

#### Scenario: sibling不误触发
- **GIVEN** 两个 array item 各有 Validation Rule
- **WHEN** 只修改第一个 item 的依赖字段
- **THEN** 第二个 item 的 Validation Rule 不被调度

### Requirement: 同步validation观察Rule稳定后的同一transaction draft
Schema validation、命中的sync Custom和Validation Rule必须（MUST）在activation及State/Computed/Effect达到稳定后读取同一个readonly final draft，并在原public mutation transaction内原子替换各自owner error set。普通validation failure只产生ValidationError并随value/state一起commit，不回滚业务mutation；provider/adapter throw、invalid result或协议失败必须（MUST）使整个transaction回滚且不发布partial errors。hidden、disabled与readonly不得（MUST NOT）改变Schema或Custom validation eligibility；Schema-inactive target/subtree必须（MUST）排除于effective validation。

#### Scenario: Computed完成后再同步校验
- **GIVEN** value change触发Computed Rule更新total，sync validator依赖total
- **WHEN** 当前transaction执行validation phase
- **THEN** validator只看到稳定后的total，value和新errors共享一次commit/version且subscriber看不到中间组合

#### Scenario: hidden但active仍校验
- **GIVEN** Field effective `visible: false`但`active: true`且disabled/readonly任意
- **WHEN** 对应trigger运行Schema与Custom validation
- **THEN** Field仍按data semantics校验，presentation状态不会清除或抑制raw error

#### Scenario: inactive subtree不参与effective validation
- **GIVEN** branch target当前Schema-inactive且保留旧value/state
- **WHEN** sibling mutation触发validation
- **THEN** 该subtree的plan不运行、其保留owner结果不计入aggregate valid；重新active时在发布前以保留值重新校验

### Requirement: ValidationScheduler区分trigger与presentation
ValidationScheduler必须（MUST）支持`change`、`blur`、`submit`与`manual`：change按committed change-set/dependency plan调度，blur按发生focus-to-blur的Field binding及affected plans调度，`validate()`触发manual全量，`submit()`触发submit全量。显式manual/submit必须（MUST）覆盖全部effective plans；automatic trigger配置不得改变error presentation。Raw direct/aggregate errors与`valid`必须（MUST）独立于`touched`/`submitCount`可读；presentable-error selector只能（MUST）按独立policy过滤现有errors，不执行validator或改变valid。

#### Scenario: blur只调度对应binding与依赖方
- **GIVEN** 两个sibling Fields分别有blur validator且首个Field从focused变为blur
- **WHEN** Runtime处理该交互command
- **THEN** 只调度首个binding及显式依赖它的plans，第二个无关validator不运行

#### Scenario: manual与submit执行完整effective validation
- **GIVEN** automatic policy仅为change且部分plan自上次change后尚未执行
- **WHEN** 调用`validate()`或`submit()`
- **THEN** 当前active Form的Schema、Validation Rule、sync与async custom plans全部参与本次结果

#### Scenario: presentation不改变valid
- **GIVEN** raw errors存在但presentation policy因untouched且未submit而隐藏它们
- **WHEN** 读取Form与Field snapshots
- **THEN** `valid`为false且raw errors可检查，presentable errors为空但不会清除source state

### Requirement: Async validation非阻塞且latest-wins
Async validator必须（MUST）在业务transaction commit后针对其target runtime binding和依赖revision调度，不阻塞该commit；开始、成功、失败与结束状态只能（MUST）通过独立Runtime state transaction更新`validating`、errors与version。每个validator/binding必须（MUST）使用单调run generation，只接受仍为latest且binding仍存在/active的结果。Runtime可以（MAY）向provider传入AbortSignal-compatible signal并主动取消旧run，但即使provider忽略取消，迟到result也不得（MUST NOT）覆盖新结果。Provider rejection/invalid output必须（MUST）结束validating并报告非阻断Runtime Diagnostic，不得伪造成业务ValidationError或泄漏原异常。

#### Scenario: value commit不等待remote result
- **GIVEN** change触发一个尚未settle的async validator
- **WHEN** public setValue transaction完成
- **THEN** 新value与sync errors先commit/publish，async run另以validation state transactions更新validating和最终result

#### Scenario: 迟到旧结果被丢弃
- **GIVEN** 同一binding的run A未完成时dependency再次变化并启动run B
- **WHEN** A在B之后或之前返回
- **THEN** 只有当前latest generation的结果可进入error state，A无论是否被abort都不能覆盖B

#### Scenario: async执行失败不成为field invalidity
- **GIVEN** latest provider reject或返回malformed issue
- **WHEN** Runtime处理settlement
- **THEN** validating恢复false并产生runtime Diagnostic，现有业务error set不会被伪造exception message替换

### Requirement: Server errors通过applyErrors独立注入与清除
`FormInstance.applyErrors()`必须（SHALL）只接受server-source error input，校验并按current `InstancePath`解析到DataNode后，在一个state transaction中以整批replacement语义更新全部Server errors；空数组必须（MUST）清空当前Server errors，非法/foreign/stale target必须（MUST）使整批回滚。Server errors不得（MUST NOT）冒充Validator output或触发provider。每条注入error默认必须（MUST）在其目标value发生有效变化时清除；调用者可以（MAY）通过readonly apply option显式保留该批error，array move本身不得视为value变化。

#### Scenario: 原子注入并聚合Server errors
- **GIVEN** 后端返回分别指向Field和Object DataNode的两条server issues
- **WHEN** 调用`applyErrors()`
- **THEN** 两条error以`source: "server"`在一次commit后出现在对应direct与ancestor aggregate snapshots

#### Scenario: 任一非法target回滚整批
- **GIVEN** 一批server errors同时包含合法path和已删除array item path
- **WHEN** Runtime校验该批输入
- **THEN** 没有Server error被应用，version/state/subscriptions保持调用前语义并返回稳定Diagnostic

#### Scenario: 目标value变化默认清除
- **GIVEN** `email`持有Server error且使用缺省clear-on-change policy
- **WHEN** email value通过public或Rule command有效改变
- **THEN** 该binding的Server error在同一transaction清除，其他target的Server errors保持不变

### Requirement: array identity与subtree lifecycle决定validation所有权
Validation state、owner error set、validating与run generation必须（MUST）按stable runtime binding而非数组index归属。Array move只能（MUST）更新当前error `InstancePath`投影并保留相同owner state；remove、replace、clear、默认whole-array replacement与reset必须（MUST）通过既有subtree lifecycle作废全部descendant run generations、清除validation state，并使任何迟到async/server reference无法绑定到后来复用index的新item。Reset还必须（MUST）将submitCount/submitting恢复初始状态。

#### Scenario: error与validating随item move
- **GIVEN** item A有direct error且async run正在进行
- **WHEN** 按`ArrayItemId`把A move到新index
- **THEN** error和run仍属于A，公开InstancePath更新，旧index的新item不继承其state

#### Scenario: remove后迟到result不可写回
- **GIVEN** item A的async run尚未完成
- **WHEN** A被remove且同一index随后出现新item
- **THEN** A的generation和errors在cleanup中作废，迟到result被丢弃且不能污染新item

#### Scenario: reset清除validation生命周期
- **GIVEN** Form含errors、validating run、server errors、submitCount和array items
- **WHEN** 调用`reset()`
- **THEN** 所有validation/run/submit source state清零、旧array binding失效，并与恢复values/identity一起至多一次有效commit

### Requirement: validate执行完整effective validation并返回稳定结果
`FormInstance.validate()`必须（SHALL）对一个committed values/activation snapshot运行完整Schema、Validation Rule、sync与async Custom validation，等待该请求所需的latest async generations settle，并返回readonly result，至少包含validated version、`valid`、aggregate errors与是否因更新被superseded的信息。被更新supersede的run不得（MUST NOT）写入当前Form state；调用必须（MUST）明确跟随latest generation或返回superseded结果，不能把stale success报告为当前valid。Operational provider/adapter failure必须（MUST）以结构化Runtime error/diagnostic与business invalid结果区分。

#### Scenario: validate等待本次async barrier
- **GIVEN** 当前Form有sync和async plans且values期间不变
- **WHEN** await `form.validate()`
- **THEN** 返回结果包含同一validated version的最终aggregate errors，所有该版本latest runs已settle且validating为false

#### Scenario: invalid是数据结果而非异常
- **GIVEN** Schema或Custom validation产生errors但protocol执行正常
- **WHEN** `validate()`完成
- **THEN** Promise正常返回`valid: false`及readonly errors，不因业务无效抛operational exception

### Requirement: submit编排计数、完整校验、序列化与handler
`FormInstance.submit(handler)`必须（SHALL）为每次attempt原子增加`submitCount`并在validation与handler期间设置`submitting: true`。它必须（MUST）对attempt的stable business snapshot执行完整validation；invalid时不得调用serializer/handler，并返回含errors的readonly invalid result。Valid时必须（MUST）使用既有active-aware `serialize()` policy从同一validated snapshot生成payload，再调用业务handler；Core不得（MUST NOT）内置HTTP。Handler完成后返回readonly success result；handler同步throw或Promise rejection必须（MUST）在`submitting`通过finally state transaction恢复false后原样传播，不能转成ValidationError或静默吞掉。

#### Scenario: invalid submit不调用handler
- **GIVEN** 完整validation产生Schema或Custom error
- **WHEN** await `submit(handler)`
- **THEN** submitCount增加、submitting最终为false、返回structured invalid result且handler未执行

#### Scenario: valid submit使用validated payload
- **GIVEN** validation成功且active-only serialization省略inactive branch
- **WHEN** submit进入handler
- **THEN** handler收到与该validated attempt对应的readonly serialized payload，Core不发起网络请求

#### Scenario: handler异常原样传播且恢复状态
- **GIVEN** validation成功但业务handler throw或reject一个error object
- **WHEN** submit Promise settle
- **THEN** 调用者收到同一异常，submitting已恢复false，validation errors不会被替换为handler异常

### Requirement: validation snapshots与subscription精确且UI library不是真相
Form、Node与Field snapshots必须（MUST）提供readonly direct/aggregate errors、validating与derived valid；Form snapshot还必须（MUST）提供submitting与submitCount。`valid`只由当前effective aggregate errors推导，`validating`按自身及active descendants/runs聚合，二者互不冒充。Advanced selectors必须（MUST）只在目标owner或ancestor aggregate实际变化时重新求值，并仅在结果变化时通知；无关Field、sibling array item和presentation-only变化不得（MUST NOT）重算raw validation selector。Framework/UI Adapter只能消费这些snapshots与presentable errors，不得启用UI library Validation作为第二真相或直接写error state。

#### Scenario: sibling error更新不通知无关Field
- **GIVEN** 分别订阅两个sibling Field的validation snapshots和Form aggregate
- **WHEN** 只有首个Field的async result改变
- **THEN** 首个与Form/ancestor selector更新，第二个Field selector不重新求值也不通知

#### Scenario: validating与valid保持独立
- **GIVEN** async run正在进行且当前没有effective errors
- **WHEN** 读取Field/Form snapshot
- **THEN** `validating`为true而`valid`仍由当前error set得出；submit/validate barrier不会把pending自动解释为error

#### Scenario: Renderer不能写Validation真相
- **GIVEN** UI library具有自己的Form validation API
- **WHEN** Framework Adapter渲染Core errors或native component触发校验UI
- **THEN** Core snapshots仍是唯一validation state来源，Adapter没有error writer/ValidationEngine/run token且本capability不定义具体DOM/ARIA呈现

### Requirement: validation failure与diagnostics保持分层和私有边界
Compiler、Adapter与Runtime必须（MUST）使用稳定Diagnostic code、正确source、typed Schema/Model位置和readonly安全metadata报告missing provider、invalid plan/path/result、adapter normalization、async execution与stale target问题。业务ValidationError不得（MUST NOT）替代operational Diagnostic；Diagnostic不得泄漏原始exception、AJV对象、values、Store、Scheduler、run token或`RuntimeNodeId`。本capability不得（MUST NOT）公开mutable ValidationEngine/Scheduler或实现Renderer error DOM、framework validation store、remote rule/data source或任意lifecycle hook。

#### Scenario: adapter协议失败原子且可诊断
- **GIVEN** Schema Adapter返回无法映射的path或malformed params
- **WHEN** Core尝试规范化本轮结果
- **THEN** 当前error replacement不发布并产生`source: "adapter"`的稳定Diagnostic，metadata足以定位adapter/Schema但不包含原始对象

#### Scenario: 公共入口隔离validation internals
- **GIVEN** consumer尝试从root/runtime/extension或deep path取得mutable error writer、ValidationScheduler、run generation、AbortController或AJV `ErrorObject`
- **WHEN** 构建consumer fixtures与declarations
- **THEN** import或类型检查失败，而批准的Application、Advanced、Extension与`@xunserver-jsf/validator-ajv`factory入口仍可用

