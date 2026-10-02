# UI / UX 重构报告

## 参考图与页面映射

在 `C:\Users\39444\.codex` 找到并查看了六张 PNG。它们只用于视觉和信息架构；图内示例数字、评分和措辞没有作为经济模型依据。

| 参考图 | 对应页面 |
| --- | --- |
| `Personal Finance Dashboard in Chinese.png` | 个人财务：状态卡、现金分层 |
| `Personal Consumption Cost Calculator Dashboard.png` | 消费计算：左输入、右结果、成本结构 |
| `Chinese Commuting Cost Comparison Dashboard.png` | 出行比较：基本通勤输入、成本与时间结果 |
| `Transportation Comparison Dashboard Mockup.png` | 出行比较的补充视觉参考 |
| `Chinese Finance Decision Dashboard.png` | 方案比较：独立方案卡、比较表 |
| `边界分析个人消费决策仪表盘.png` | 边界分析：参数、临界值与曲线 |

## 文件与组件

修改 `src/App.tsx`、`src/components.tsx`、`src/main.tsx`、`README.md`，并新增 `src/Sidebar.tsx`、`src/navigation.ts`、`src/refresh.css`、`src/DashboardVisuals.tsx`、`src/chartData.ts` 和 `tests/chartData.test.ts`。`src/core/boundary.ts` 只将现有 `withCarPrice` 函数导出，供价格图复用与边界反解完全相同的融资价格变换；函数体和经济计算公式未改。

新增统一侧栏/手机导航、`PageHeader`、编号 `Section`、`CashLayers`、`ScenarioCard`、`InfoTip` 和图表数据适配。复用并扩展原有 `NumberField`、`Metric`、`DetailModal`、`LineChart`、`BarChart`、`TcoComposition`、`ScenarioForm`，以及 V2 计算与状态迁移函数。财务、消费、出行、方案比较、边界分析五页均按参考图的层级调整，较少使用的输入与结果折叠显示。没有增加综合体验分、自动推荐或“合理/推荐价格”。

## 图表与数据

折线图由当前状态调用 V2 计算结果动态生成，没有固定示例结果。时间成本图保留核心曲线全部 91 个计算点，并加入当前输入点与数学交点；每个实际绘制点都有圆点、X 标签、Y 标签和包含数值单位的悬停标题。当前点有强调色及双向虚线，用户阈值有水平虚线，交点单独标记并显示 X/Y。图下有可展开的数据表。其他重要折线图使用相同组件。为避免接近的 X 值使文字重叠，点间保留最小标签距离，因此水平视觉距离不严格按数值比例；精确坐标以标签和表格为准。手机触摸操作可通过数据表读取完整数值。

## 数据兼容与验收

`consumer-boundary-app-v2` 存储键和原有 localStorage migration 均保留，状态结构没有因 UI 调整而变更。浏览器验收确认：修改方案价格会实时更新经济 TCO；刷新后输入仍保存；恢复测试输入后结果回到原值；持有周期不同时，总增量仍显示“不可直接比较”。桌面宽度约 1560 px、手机有效宽度 375 px 下，页面没有横向溢出；手机方案卡为单列，比较表和曲线在容器内横向滚动。

修改前基线：原有 30 项测试全部通过，生产构建通过。UI 修改后：32 项测试全部通过（含 2 项图表接入测试），`pnpm build` 通过。现有 V2 模型测试和旧数据迁移测试均仍通过。

## 仍存在的 UI 限制

- 时间成本曲线点数较多，需要在图表内部横向滚动；数据表可查看完整列表。
- 浏览器原生 SVG 悬停标题主要适合鼠标；手机端以图上的坐标标签和数据表读取数值。
- 比较页的“统一分析周期”仍是 V2 预留字段，未建模替代链，不参与跨周期总 TCO 比较。
