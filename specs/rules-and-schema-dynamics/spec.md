# rules-and-schema-dynamics Specification

## Purpose

为不可变 Form Model 与事务 Runtime 提供可静态分析的同步 Rule、有限 Schema activation、确定依赖调度和 active-aware serialization，使联动结果在数组 scope 内也能原子、精确且框架无关地发布。

## Requirements

### Requirement: Rule compiler 生成可检查且不可变的 RuleModel
Compiler 必须（MUST）规范化每条 State、Computed、Validation 与 Effect Rule，为缺省 ID 分配确定 ID，校验重复 ID、target `ModelPath`、field dependency、array/recursive scope compatibility及named Rule Function引用，并提取所有显式依赖。成功的`RuleModel`必须（MUST）包含按确定顺序排列的readonly compiled rules及`ModelPath -> readonly RuleId[]`索引；任一阻断问题必须（MUST）进入`CompileError`且不发布partial Model。

#### Scenario: 编译Rule与dependency index
- **GIVEN** 两条Rule分别读取`country`和`products[].quantity`，并调用已注册named function
- **WHEN** 使用同一frozen `FormEnvironment`编译Definition
- **THEN** `RuleModel`保留规范化category、target、function key、显式dependencies和确定Rule ID，两个dependency path可索引到对应Rule ID

#### Scenario: 聚合非法target与function引用
- **GIVEN** 一条Rule指向不存在的`ModelPath`，另一条Rule调用Environment中未注册的function key
- **WHEN** Compiler能安全检查两者
- **THEN** `CompileError`以确定顺序包含带`modelPath`/function key的Rule diagnostics，且没有partial `RuleModel`

#### Scenario: 拒绝无法唯一绑定的array dependency
- **GIVEN** Rule target位于`products[].total`，dependency位于无共同item scope的`orders[].amount`
- **WHEN** Compiler无法在单个rule instance中确定应绑定哪个order item
- **THEN** 编译以scope-ambiguous Diagnostic失败，而不使用当前index、首项或全数组隐式聚合

#### Scenario: 重复编译保持RuleModel稳定
- **GIVEN** 相同Definition与Environment期间未改变
- **WHEN** 重复执行`compileForm()`
- **THEN** Rule ID、compiled AST、dependency index顺序和diagnostics语义相同，且公开collection不可修改

### Requirement: named Rule Function 只通过一致Environment同步求值
`call`表达式必须（MUST）按编译时已解析的Registry key在compile/create一致的frozen Environment中调用Rule Function。Provider只能（MUST）接收已求值、Runtime-owned readonly JSON-compatible参数并同步返回JSON-compatible结果；它不得（MUST NOT）读取Form/Store、声明隐藏field dependency、enqueue command或返回Promise/thenable。Provider throw、无效返回值或运行期缺失必须（MUST）使当前创建或transaction以结构化Diagnostic原子失败。

#### Scenario: 按名称调用纯函数
- **GIVEN** `company.taxRate`已在当前Environment注册，Rule AST以field expressions构造其readonly参数
- **WHEN** Rule在一个transaction中求值
- **THEN** Runtime只向provider传入参数值并使用其同步结果，所有dependency均来自可检查AST

#### Scenario: Function失败不发布中间态
- **GIVEN** 一个registered provider抛出异常、返回thenable或返回非JSON-compatible值
- **WHEN** 受影响Rule在已有value draft后执行
- **THEN** transaction回滚values/rule state/version且不通知普通subscriber，Runtime Diagnostic不包含原始exception对象

### Requirement: DependencyScheduler 按实例scope精确调度
Schema Dynamics、State/Computed/Effect Rule与后续Validation Rule plan必须（MUST）复用同一个transaction-owned dependency scheduler和committed change set。该 scheduler 是内部协调器：根据 value/field change set、Schema activation `false→true` 翻转集合以及 `forceAll`/`reset` 标志，计算本轮应求值的 Rule instance 与应交 Validation 的 plan binding；必须（MUST）复用既有 BindingIndex 与 `ArrayItemId` chain 语义，不得（MUST NOT）成为公开 Application/Runtime/Extension API。静态Rule template在每个materialized array/recursive binding中形成独立rule instance；具有共同`[]`祖先的target/dependency必须（MUST）解析到相同`ArrayItemId` chain，root/ancestor dependency保持共享语义。无关path或sibling item不得（MUST NOT）重新求值。公共 mutation 必须（MUST）经 `FormRuntime` 事务入口进入 phase 流水线，而不是要求消费者持有 `TransactionManager` 类型。

#### Scenario: array item Rule绑定同一item
- **GIVEN** Rule target为`products[].total`且读取`products[].price`与`products[].quantity`
- **WHEN** 只修改`products[2].quantity`
- **THEN** 只调度同一稳定item scope中的Rule instance，其他product item的Rule和selector不重新求值

#### Scenario: move不重建Rule instance
- **GIVEN** 一个array item已materialize computed/state Rule instance
- **WHEN** item按`ArrayItemId` move到新index
- **THEN** Rule instance与缓存state跟随相同runtime binding，仅current `InstancePath`更新且不因index变化虚构dependency value change

#### Scenario: append与remove更新scheduler binding
- **GIVEN** list item template包含Rules
- **WHEN** append新item后再remove另一个item
- **THEN** append只为新binding建立Rule instances，remove通过subtree lifecycle清理目标instances，迟到工作不能绑定到复用index的新item

#### Scenario: 初始值在公开前稳定
- **GIVEN** initial values触发activation、State、Computed和Effect Rule
- **WHEN** `createForm()`成功返回
- **THEN** 首个公开snapshot已达到稳定结果、未发布中间态，稳定后的初始baseline为dirty/reset比较基准且public version从0开始

#### Scenario: activation翻转触发精确重调度
- **GIVEN** inactive branch 上的 Computed/Effect 在 inactive 期间其依赖已变化且保留 draft values
- **WHEN** Schema activation 使该 branch 变为 active
- **THEN** dependency scheduler 在同一 transaction 内重新调度该 branch 的 State/Computed/Effect 与后续 Validation plan，无关 sibling 不重算，subscriber 只看到最终稳定 snapshot

### Requirement: State Rule 只产生独立的rule-owned状态结果
State Rule必须（MUST）只产生`active`、`visible`、`disabled`或`readonly`的boolean rule-owned结果，不得（MUST NOT）直接修改value、UIModel、ViewTree或其他source namespace。缺省`when`视为true；`when`为false时该Rule对目标属性提供neutral结果。非boolean状态结果必须（MUST）使当前transaction失败而不发布partial effective snapshot。

#### Scenario: State Rule更新effective selector
- **GIVEN** 一个visible Rule读取`advancedMode`且目标Field当前active
- **WHEN** public command改变`advancedMode`
- **THEN** Rule在同一transaction中更新自己的state结果，subscriber只看到commit后的新effective visible

#### Scenario: State Rule不改business value
- **GIVEN** disabled与readonly Rule同时命中一个Field
- **WHEN** Rules求值完成
- **THEN** Field的effective状态改变，但`getValues()`及Field value保持原业务语义

### Requirement: Computed Rule 形成单writer DAG并在transaction内拓扑求值
每个Computed target最多只能（MUST）有一个writer；Compiler必须（MUST）从computed target/dependency建立DAG，并在compile time阻断self-cycle、多节点cycle与多writer冲突。Runtime必须（MUST）按确定拓扑顺序同步求值，将结果作为声明式value command加入当前transaction，并使computed target默认effective readonly；任何直接或Effect写入computed target都必须（MUST）在稳定前重新经过其owner Rule。

#### Scenario: 链式computed按拓扑顺序稳定
- **GIVEN** `subtotal`依赖line values，`total`依赖`subtotal`
- **WHEN** 一个line value改变
- **THEN** Runtime先求值`subtotal`再求值`total`，所有value/effective state一次commit且version只增加一次

#### Scenario: computed target默认readonly
- **GIVEN** 一个Field是Computed Rule target且没有其他readonly policy
- **WHEN** 读取其effective snapshot
- **THEN** `readonly`为true但value仍来自唯一nested values source，不在Field state复制第二份computed value

#### Scenario: cycle与多writer阻断编译
- **GIVEN** computed A依赖B且B依赖A，或两条Computed Rule写同一target
- **WHEN** 编译RuleModel
- **THEN** `CompileError`包含确定cycle path或writer IDs，且不发布partial Model

### Requirement: Effect Rule 只能enqueue受限声明式命令
Effect Rule必须（MUST）只包含静态声明的`setValue` action及可序列化value expression；不得（MUST NOT）包含任意callback、动态Path、array结构命令、touch/focus、validation/submit或I/O。命中的actions必须（MUST）按compiled顺序加入当前Change Queue，沿用no-op、rollback、一次version及command/iteration limits；不收敛必须（MUST）回滚整个transaction。

#### Scenario: Effect写入留在当前transaction
- **GIVEN** 一个Effect在`country`变化时声明式设置`region`
- **WHEN** `country`通过public command更新
- **THEN** Effect command与原始mutation在同一queue稳定，subscriber只看到两者完成后的一个version

#### Scenario: no-op Effect不重复循环
- **GIVEN** Effect计算出的target value已与draft语义相同
- **WHEN** Rule被调度
- **THEN** action作为no-op不产生新dependency change，也不增加额外iteration或publish

#### Scenario: oscillating Effect完整回滚
- **GIVEN** 两个Effect持续把同一value在不同结果间切换
- **WHEN** scheduler超过确定command或iteration limit
- **THEN** transaction以non-converging Diagnostic失败，保留commit前values/state/version且不发布subscriber

### Requirement: Validation Rule 只形成后续Validation可消费的计划
Validation Rule必须（MUST）具有target、可序列化boolean assertion、可选enable condition、显式dependencies与readonly failure metadata，并在RuleModel中通过与其他Rules相同的function/scope校验。Runtime dependency scheduler必须（MUST）把受影响且active的Validation Rule binding作为readonly plan交给既有sync Validation phase port；本capability不得（MUST NOT）创建`ValidationError`、写Node errors/validating、定义trigger policy或暴露validation结果。

#### Scenario: 编译Validation Rule结构
- **GIVEN** Rule声明target、assertion、code/message params且引用registered Rule Function
- **WHEN** 编译Definition
- **THEN** RuleModel保留readonly assertion/failure metadata和dependency index，ValidationModel与NodeState不会被本步骤伪造结果

#### Scenario: 稳定后交给Validation owner
- **GIVEN** active Validation Rule的dependency在Rule/effect循环中发生变化
- **WHEN** transaction达到Rule稳定点
- **THEN** sync Validation port收到最终draft、Rule ID与准确instance binding，且只由后续Validation owner决定是否及如何产生`ValidationError`

#### Scenario: 未安装Validation实现时不冒充valid
- **GIVEN** Model含Validation Rule但只交付本change的no-op Validation phase owner
- **WHEN** Rule dependencies变化
- **THEN** Runtime不发布error、valid/validating或`validate()`行为，transaction的其他Rule语义仍可完成

### Requirement: Schema Dynamics 编译有限conditional activation plan
Dynamics compiler必须（MUST）把static superset中`oneOf`、`anyOf`、`if/then/else`与`dependentSchemas`的branch provenance编译为readonly activation plan，包含branch-owned ModelPaths、确定predicate dependencies与Schema来源。Core只能（MUST）接受可由首期同步predicate语义精确判断的有限条件；无法保真判断的合法Schema必须（MUST）产生明确unsupported/ambiguous compile Diagnostic，不得依赖具体Validator或按分支顺序猜测。

#### Scenario: 编译discriminated oneOf与anyOf
- **GIVEN** oneOf/anyOf branches通过有限const/enum/required等受支持判别条件区分
- **WHEN** 编译SchemaDynamics
- **THEN** 每个branch拥有可追溯`SchemaPath`、predicate dependencies和static-superset node集合，DataModel本身仍无instance active state

#### Scenario: 编译if与dependentSchemas
- **GIVEN** `if/then/else`使用受支持predicate且`dependentSchemas`以property presence触发
- **WHEN** 编译Dynamics plan
- **THEN** then/else与dependent branch都具有确定activation记录，触发presence不被误写成property truthiness

#### Scenario: 无法保真的condition显式失败
- **GIVEN** conditional需要首期不支持或无法静态确定的Schema predicate才能选择branch
- **WHEN** Dynamics compiler处理该Schema
- **THEN** 编译产生带Schema来源的能力Diagnostic并阻断需要猜测的activation plan

### Requirement: Runtime activation 只切换实例状态并保留inactive内容
Activation phase必须（MUST）在State/Computed/Effect前同步求值：oneOf恰好一个匹配branch active，anyOf的每个匹配branch active，if在then/else间选择，dependentSchema按property presence切换；common/base node保持active，branch共享node在任一owner branch active时active。branch切换不得（MUST NOT）增加、删除或修改Compiled Model node，也不得清除inactive values、Field/View state或Array identity。重新 active 时必须（MUST）通过共享 dependency scheduler 按保留值重新调度该 subtree 的 State/Computed/Effect 与后续 Validation plans。

#### Scenario: branch切换保留draft state
- **GIVEN** then branch中的Field已有value、touched和View state
- **WHEN** discriminator切到else后再切回then
- **THEN**同一static/runtime binding重新active并恢复保留value/state，期间`CompiledFormModel`引用和内容不变

#### Scenario: inactive仍可寻址和编程修改
- **GIVEN** 一个branch当前inactive
- **WHEN** 调用者通过合法`InstancePath`读取或`setValue()`修改其node
- **THEN** command仍按普通transaction保存值，但该subtree的Computed/Effect/Validation Rule不会作为effective work运行

#### Scenario: oneOf暂时歧义不猜branch
- **GIVEN** 当前draft使oneOf零个或多个branch匹配
- **WHEN** activation phase求值
- **THEN** common nodes保持active、exclusive branch nodes暂时inactive，并通过Runtime diagnostic channel报告歧义而不按顺序选branch或把表单mutation当validation error拒绝

#### Scenario: 重新active会重新调度
- **GIVEN** inactive subtree期间保留values且相关dependency已改变
- **WHEN** subtree变为active
- **THEN** 其State/Computed/Effect与后续Validation plans在当前transaction按保留值重新调度，subscriber只看到最终稳定snapshot

### Requirement: effective状态具有固定组合优先级且active不等于visible
Runtime必须（MUST）为Node/Field/View/Form提供readonly effective `active`、`visible`、`disabled`与`readonly` selector，并为Field与Field View额外提供readonly effective `required`。Form root必须（MUST）保持active，Compiler必须（MUST）拒绝以active Rule关闭root。非root `active`由ancestor active、Schema activation和所有适用active Rule以逻辑AND组成；Rule不得重新激活Schema-inactive node。`visible`由effective active、ancestor visible、UI静态visible和适用visible Rule以AND组成；`disabled`由ancestor/UI/适用Rule的true结果以OR组成；`readonly`同样以OR组成并把Computed target作为强制true。`required`由Field的requirement presentation source与当前Schema activation state组成：static required为true、static optional或无来源为false、conditional来源仅当其关联activation source当前active时为true；Field自身effective inactive时`required`必须（MUST）为false。`visible`、`disabled`、`readonly`、Widget props、`native`与Validation结果不得（MUST NOT）参与`required`组合。缺省gate必须（MUST）分别为active/visible true、disabled/readonly/required false。

#### Scenario: hidden保持active
- **GIVEN** Field的visible policy为false但Schema与active Rules均为true
- **WHEN** 读取effective snapshot并修改该Field value
- **THEN** snapshot报告`active: true`、`visible: false`，value mutation仍参与Rule与后续Validation/serialization

#### Scenario: Schema inactive不能被visible或Rule active覆盖
- **GIVEN** Schema branch为inactive，但UI visible与State Rule active均求值为true
- **WHEN** 读取effective snapshot
- **THEN** `active`与`visible`均为false，disabled/readonly来源仍保持独立且没有source被改写

#### Scenario: 多来源组合确定且保守
- **GIVEN** UI声明disabled，另一个Rule返回disabled false，同时target是Computed Field
- **WHEN** 构建effective snapshot
- **THEN** disabled仍为true、readonly为true，组合结果不依赖Rule注册或执行偶然顺序

#### Scenario: 静态required直接投影
- **GIVEN** Object Schema静态要求`name`而`nickname`为optional，两者都生成Field
- **WHEN** 读取两个Field及其View的effective snapshot
- **THEN** `name`报告`required: true`，`nickname`报告`required: false`，且该值不因visible、disabled或readonly变化而改变

#### Scenario: conditional required跟随activation切换
- **GIVEN** conditional Schema只在`type === "company"`分支active时要求`companyName`
- **WHEN** 在同一transaction内把`type`从`person`改为`company`
- **THEN** `companyName`的`required`在同一次commit中从false变为true，切回`person`后恢复false；Field值与touched状态保留

#### Scenario: inactive Field不报告required
- **GIVEN** 某Field位于当前inactive的Schema branch且其edge静态required
- **WHEN** 读取effective snapshot
- **THEN** `active: false`且`required: false`；重新active后`required`恢复为true而无需Renderer读取Schema或DataModel edge

#### Scenario: 精确selector只通知受影响状态
- **GIVEN** 分别订阅两个sibling Field的effective selectors
- **WHEN** 一个State Rule只改变首个Field的visible结果，或一次activation切换只改变首个Field的required
- **THEN** 首个及受影响ancestor selector发布稳定snapshot，sibling selector不重新求值或通知

### Requirement: serialize 基于committed active binding生成readonly输出
`FormInstance.serialize(options?)`必须（SHALL）同步读取一个已提交version并返回不含Runtime identity/state的readonly JSON-compatible结果。缺省`includeInactive`必须（MUST）采用Compiled Form Config的`serializeInactive`（未配置时为false）；active-only模式递归省略inactive object property和array item、保留其余item顺序并继续prune descendants，且不得（MUST NOT）依据visible/disabled/readonly删值。显式option可以（MAY）覆盖inactive policy。

#### Scenario: 默认active-only而getValues保留全部
- **GIVEN** inactive branch与hidden-but-active Field都持有业务值，且未配置`serializeInactive`
- **WHEN** 分别调用`getValues()`与`serialize()`
- **THEN** `getValues()`保留两者，serialized结果省略inactive branch但保留hidden active Field，Runtime values不被修改

#### Scenario: 显式包含inactive值
- **GIVEN** Form Config默认active-only且多个branch保存draft
- **WHEN** 调用`serialize({ includeInactive: true })`
- **THEN** 输出包含完整committed business values语义，但仍不含`ArrayItemId`、touched、errors或内部binding

#### Scenario: active-only数组保持有效顺序
- **GIVEN** array中部分item或descendant node inactive
- **WHEN** 执行active-only serialization
- **THEN** inactive item被省略、保留item按当前ArrayState order输出，active item内的inactiveproperty也被递归省略且ID不进入payload

### Requirement: named Serializer 在Core pruning之后运行且无mutation能力
`serialize()`可以（MAY）按显式option或Compiled Form Config选择同一frozen Environment中的named Serializer。Core必须（MUST）先应用includeInactive policy，再把Runtime-owned readonly JSON-compatible值及只读version/policy context交给provider；provider必须（MUST）同步返回JSON-compatible结果，且不得（MUST NOT）获得Form、Store、command、RuntimeNodeId或修改原values。unknown serializer、throw、thenable或无效输出必须（MUST）以Runtime Diagnostic失败且不改变Form version/state。

#### Scenario: named Serializer消费pruned snapshot
- **GIVEN** Environment注册`company.payload`且Form Config选择它
- **WHEN** 调用无参数`serialize()`
- **THEN** provider收到已按默认active policy处理的readonly值和committed version，并返回其JSON-compatible转换结果

#### Scenario: Serializer失败不成为transaction
- **GIVEN** 请求不存在的serializer或provider抛错/返回thenable
- **WHEN** 调用`serialize()`
- **THEN** 调用以结构化`FormRuntimeError`失败，values/effective state/version与所有普通subscriptions保持不变

### Requirement: Rule与Dynamics首期保持纯同步及owner隔离
本capability不得（MUST NOT）执行async Rule、fetch、remote DataSource/options、任意lifecycle hook或Runtime recompilation，也不得实现`ValidationError`、Validator/ValidationScheduler、async/server errors、`validate()`、`applyErrors()`、`submit()`或Renderer。Rule/Dynamics不得（MUST NOT）取得mutable Store、Dependency Graph、Change Queue writer或Compiled Model mutator；非法AST、cycle、function、activation和不收敛问题必须（MUST）以稳定compiler/runtime diagnostics显式报告。

#### Scenario: 拒绝async与I/O能力
- **GIVEN** 扩展作者尝试让Rule Function返回Promise、从AST声明fetch/remote source或注册任意before/after hook
- **WHEN** 执行type/compile/runtime contract检查
- **THEN** 受支持契约拒绝该能力或产生稳定Diagnostic，不会静默执行异步工作

#### Scenario: Renderer只消费effective snapshot
- **GIVEN** Framework integration需要渲染conditional Field
- **WHEN** 它通过Advanced selector读取resolved ViewTree对应的effective snapshot
- **THEN** 无需解释Rule/Schema来源即可取得active/visible/disabled/readonly，且不能反向修改state或Model
