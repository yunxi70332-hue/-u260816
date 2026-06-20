# 第一版项目逻辑

## 1. 项目目标

第一版目标是做一个可离线运行的 USM 风格 3D 模块搭建器。

核心要求：

- 在 Windows 本地使用
- 不依赖线上 USM 配置器接口
- 不依赖外部图片、字体或 3D 资源
- 构建后可直接打开 `dist/index.html` 离线使用
- 支持基础结构搭建、颜色切换、BOM、估算价、导入导出

## 2. 运行逻辑

项目有两种入口：

- 开发版：双击 `start-windows.bat`，启动 Vite 本地服务，再打开 `http://127.0.0.1:5173/`
- 离线版：先执行 `npm run build`，再双击 `start-offline.bat` 打开 `dist/index.html`

离线成立的关键点：

- `vite.config.ts` 设置 `base: "./"`，构建出的 JS/CSS 都使用相对路径
- 3D 标注文字使用本地 canvas 生成贴图，不加载外部字体文件
- 页面所有功能都在浏览器端完成，不请求远程 API
- 配置保存使用 `localStorage`

## 3. 主要文件职责

| 文件 | 职责 |
| --- | --- |
| `src/main.tsx` | React 应用入口 |
| `src/App.tsx` | 页面状态、控制面板、导入导出、BOM 展示 |
| `src/model.ts` | 配置数据结构、尺寸选项、BOM、估价、配置归一化 |
| `src/BuilderScene.tsx` | Three.js 3D 场景、柜体建模、相机、尺寸标注 |
| `src/styles.css` | 页面布局和响应式样式 |
| `vite.config.ts` | Vite 构建配置，保证离线路径 |
| `start-windows.bat` | 开发版启动脚本 |
| `start-offline.bat` | 离线版启动脚本 |
| `scripts/verify-offline-cdp.mjs` | 离线 file:// 渲染验证脚本 |

## 4. 核心数据模型

所有柜体配置集中在 `CabinetConfig`：

```ts
interface CabinetConfig {
  depth: number;
  columnWidths: number[];
  rowHeights: number[];
  panelColor: string;
  colorScope: "all" | "single";
  frameFinish: "chrome" | "graphite";
  feet: "glides" | "caster-low" | "caster-high";
  structureMode: "complete" | "noFront" | "noPanels" | "frameOnly";
  showDimensions: boolean;
  cells: CellConfig[][];
  workSurfaces: WorkSurfaceConfig[];
}

interface WorkSurfaceConfig {
  id: string;
  kind: "deskTop" | "bridgeTop";
  fromColumn: number;
  toColumn: number;
  row: number;
  depth: number;
  thickness: number;
  overhangFront: number;
  overhangBack: number;
  overhangLeft: number;
  overhangRight: number;
  color?: string;
  enabled: boolean;
}
```

解释：

- `depth`：整体深度，当前支持 250 / 350 / 500 mm
- `columnWidths`：每一列的宽度数组
- `rowHeights`：每一层的高度数组
- `panelColor`：板件颜色
- `frameFinish`：钢管表面，镀铬或石墨
- `feet`：脚垫或滚轮
- `structureMode`：完整、隐藏正面、仅开放格、全框架的批量显示模式
- `showDimensions`：是否显示尺寸标注
- `cells`：二维格子配置，行列对应每个模块格
- `workSurfaces`：跨格台面/桌面配置，独立于单个格子，不占用某个格子的前脸

单元格类型：

```ts
type CellKind = "open" | "back" | "drop" | "drawer" | "glass" | "tray";
```

对应功能：

- `open`：开放格
- `back`：背板格
- `drop`：下翻门
- `drawer`：三抽屉
- `glass`：玻璃门
- `tray`：托盘格

## 5. 页面状态流转

第一版的状态流是单向的：

1. 启动应用
2. 从 `localStorage` 读取上次配置
3. 用 `normalizeConfig()` 清洗配置
4. 用户在控制面板修改尺寸、格子、颜色、配件
5. `updateConfig()` 更新 `CabinetConfig`
6. 自动重新计算尺寸、BOM、估算价
7. 自动刷新 3D 场景
8. 自动写回 `localStorage`

简化流程：

```text
用户操作
  -> App.tsx 更新 CabinetConfig
  -> model.ts 归一化/计算 BOM/计算价格/计算尺寸
  -> BuilderScene.tsx 根据 config 重建 3D 画面
  -> localStorage 保存当前配置
```

## 6. 控制面板逻辑

控制面板分为四个 tab：

### 结构

功能：

- 选择深度
- 修改当前选中列的宽度
- 修改当前选中层的高度
- 增减列数
- 增减层数
- 设置选中格子的结构元素
- 使用快速结构预设

列数和层数限制：

- 最少 1
- 最多 10

增加列或层时：

- 新列默认宽度 350 mm
- 新层默认高度 350 mm
- 新格子默认开放格

### 配件

功能：

- 底部支撑：脚垫 / 滚轮
- 钢管表面：镀铬 / 石墨
- 是否显示尺寸标注

### 颜色

功能：

- 选择板件颜色
- 当前颜色会应用到门板、背板、托盘、抽屉面板等板件

### BOM

功能：

- 显示估算价
- 展示基础 BOM
- 导出 CSV

## 7. 3D 建模逻辑

3D 场景由 `BuilderScene.tsx` 负责。

### 单位换算

真实尺寸以 mm 存储，渲染时按比例转换为 Three.js 单位：

```ts
const SCALE = 0.004;
```

例如：

- 750 mm -> 3 Three.js 单位
- 350 mm -> 1.4 Three.js 单位

### 柜体布局

`createLayout(config)` 根据配置生成：

- `xBounds`：所有列的左右边界
- `yBounds`：所有层的上下边界
- `zBounds`：前后深度边界
- `cells`：每个格子的中心点和尺寸
- `xSegments`：横向钢管
- `ySegments`：竖向钢管
- `zSegments`：深度钢管

### 结构渲染

3D 画面由这些部分组成：

- 球节点：所有 x/y/z 边界交点
- 横向钢管：每层前后两侧
- 竖向钢管：每列前后两侧
- 深度钢管：前后连接
- 脚垫或滚轮
- 每个格子的内容
- 黄色选中框
- 尺寸线和尺寸标注

### 格子类型渲染

| 类型 | 3D 表现 |
| --- | --- |
| 开放格 | 纯框架/开放空间 |
| 背板格 | 背板加底板 |
| 下翻门 | 前门板、拉手、黄色角标 |
| 三抽屉 | 三块抽屉面板和拉手 |
| 玻璃门 | 半透明玻璃门和背面透明板 |
| 托盘格 | 内部托盘和底板 |

### 相机逻辑

`CameraRig` 会根据柜体宽度、高度、深度和画布尺寸自动调整相机距离。

目的：

- 单格柜不显得太远
- 多列宽柜不被裁切
- 移动端和桌面端都能完整显示

### 离线尺寸标注

尺寸标注没有使用外部字体资源。

实现方式：

1. 创建本地 canvas
2. 在 canvas 上绘制文字
3. 把 canvas 转成 Three.js `CanvasTexture`
4. 用 `sprite` 显示在 3D 场景里

这样 `file://` 离线打开时也能显示 3D 标注。

## 8. BOM 和估价逻辑

BOM 由 `buildBom(config)` 生成。

基础规则：

- 球节点数量 = `(列数 + 1) * (层数 + 1) * 2`
- 横向钢管按每列宽度、每层边界、前后两侧计算
- 竖向钢管按每层高度、每列边界、前后两侧计算
- 深度钢管按深度、所有边界连接点计算
- 膨胀螺丝 = 全部钢管数量 * 2
- 脚垫/滚轮按底部支撑点计算
- 工厂 BOM 优先输出可下料细项，不再把下翻门默认合并成单个组件

工厂板件规则：

- `金属扣板` 合并水平扣板和需要金属背面的背板；水平扣板按物理水平板线去重，同一层分隔线只算一次。
- `外板` 指柜体左右最外侧单面侧板；数量按需要封侧的层数 * 左右两侧计算。
- `内板` 指左右相邻模块共用的安装面；只有该位置需要安装铰链、抽屉、托盘或内部配件时才计入，一处共享板只算 1 张。
- 开放格默认只参与水平扣板线；不因为中间有分隔线就自动生成内板。

不同格子的 BOM 增量：

- 背板格：金属扣板规格中增加背板数量
- 下翻门：下翻门门板、一元锁、锁盒+螺丝、下翻门铰链、铰链螺丝、L型金属件、L型垫片、月牙扣
- 三抽屉：抽屉面板、抽屉导轨
- 玻璃门：玻璃门、玻璃铰链五金
- 托盘格：触发内板安装面，按具体配件增加托盘和导轨
- 跨格桌面：按 `workSurfaces` 的实际列跨度、深度、厚度和出沿生成桌面板

价格由 `estimatePrice(config)` 计算：

```ts
总价 = BOM 每一项 qty * unitPrice 的合计
```

注意：

当前价格是第一版本地估算，不是官方报价，也不是最终工厂报价。

## 9. 导入导出逻辑

### 导出配置

导出当前 `CabinetConfig`：

```text
usm-config.json
```

用途：

- 保存设计方案
- 换电脑继续编辑
- 后续接工厂报价系统

### 导入配置

读取 JSON 文件后：

1. `JSON.parse`
2. `normalizeConfig`
3. 重置选中格子为第一格
4. 刷新界面和 3D

### 导出图片

3D 场景开启了：

```ts
preserveDrawingBuffer: true
```

所以可以从 canvas 直接生成 PNG：

```text
usm-3d-preview.png
```

### 导出 BOM

把 `buildBom(config)` 的结果导出为 CSV：

```text
usm-bom.csv
```

## 10. 离线验证逻辑

第一版用 `scripts/verify-offline-cdp.mjs` 验证离线可用性。

验证内容：

- 直接打开 `file://.../dist/index.html`
- 检查页面 title
- 检查 canvas 是否存在
- 检查 WebGL 是否可用
- 检查 canvas 是否生成了非空 PNG 数据
- 生成离线截图到 `output/offline/offline-cdp.png`

## 11. 第一版边界

第一版已经能用，但还不是完整商业级配置器。

暂未实现：

- 官方 USM 精确零件规则
- 官方价格体系
- 碰撞/结构合法性校验
- 真实 SKU 编码
- 真实材质贴图
- 门板开启动画
- 复杂配件库
- Windows exe 安装包
- 多方案管理
- 自动生成工厂级拆单

## 12. 后续建议

下一阶段建议按这个顺序扩展：

1. 修正中文源码编码显示，保证所有编辑器打开都是 UTF-8
2. 接入真实零件表和价格表
3. 增加结构合法性校验
4. 增加方案列表和项目保存
5. 增加工厂 BOM 格式
6. 打包成 Windows exe
7. 加入更真实的 USM 材质和零件模型

## 13. 配件逻辑 0.2 入口

配件搭配规则以 `docs/USM_ACCESSORY_LOGIC_MAP.md` 为准。

新口径：

- 结构层要放开，支持异形、错层、局部缺格、不同深度、书桌面和跨格台面。
- 工厂 BOM 尺寸可以自定义，非官方尺寸不直接灰显。
- 配件层仍按官方公开搭配逻辑校验：前脸互斥、导轨安装面、玻璃搁板金属 panel 支撑、门/抽屉/托盘开合路径等。
- UI 状态拆为 `officialExact`、`officialLogicCustomSize`、`needsHardwareCheck`、`blocked`，只有真实结构冲突才禁用。

已落地的第一阶段：

- `src/model.ts` 增加配件四态评估：官方规格、工厂定制尺寸、五金确认、逻辑冲突。
- 结构元素和带围边抽屉按钮会显示对应状态；自定义尺寸显示为定制或确认，不直接禁用。
- 网格上限提升到 10 列 / 10 层，继续使用 `enabled=false` 表达局部缺格异形结构。
- 单格已支持局部深度覆盖：全柜深度作为默认值，选中格可以单独改深度；BOM、外部尺寸、配件评估和 3D 布局会优先使用该格深度。
- 快速结构增加“阶梯异形”和“书桌单元”预设，作为后续 topology graph 的入口。
- `CabinetConfig.workSurfaces` 已支持跨格桌面/桥接台面；`书桌单元` 预设会生成 2500 x 640 x 32 mm 的跨格桌面。
- `buildBom(config)`、外部尺寸和 3D 相机包围盒已纳入跨格桌面；`BuilderScene.tsx` 会渲染桌面厚板和边线。
- 配件评估已加入玻璃 shell 初筛：玻璃侧板/玻璃箱体不是金属安装面，普通下翻门、上翻门、侧开门、移动托盘、固定托盘和普通层板会禁用；玻璃搁板保留为夹件/五金确认。
- 配件评估已加入台面路径初筛：上翻门撞台面禁用；移动托盘/带围边抽屉在台面下方按高度、出沿进入禁用或五金确认；下翻门按书桌方向允许但提示限位和开合半径确认。
- 内部已加入整柜“生产校验”函数，不参与报价，也不在前端单独展示；它用于脚本门禁和后续出厂 BOM 审核，只判断当前 3D 配置能不能在生产中成立。
- 生产校验会扫描当前已选配件，而不是只看候选按钮。例如玻璃箱体本身不是硬冲突，但内部报告会提示它只能按展示格生产，后续不能直接叠加普通下翻门、移动托盘或固定托盘；如果当前格已经是低高度移动托盘，则内部报告会进入硬冲突。

可运行验证：

- `npm.cmd run export:logic-matrix` 会生成 `docs/USM_ACCESSORY_LOGIC_MATRIX.json`，作为产品逻辑导图到前端按钮状态、BOM 标注、禁用原因的中间矩阵。
- `npm.cmd run verify:logic` 会验证下翻门基础逻辑、移动托盘与固定托盘分流、带围边抽屉高度、玻璃箱体禁装下翻门/托盘/导轨、自定义尺寸状态、阶梯异形缺格、逻辑矩阵关键状态、整柜生产校验报告，以及门/托盘/抽屉/玻璃箱体之间的替换后数据清理。书桌 BOM 金额与台面路径断言暂时跳过，等书桌模型重做后恢复。

## 14. 经销商报价源 0.3 入口

材料报价表已经作为可替换变量接入，不再把经销商价格写死在产品结构逻辑里。

默认报价源：

- `src/data/simple-home-price-source.json`
- 来源：`Simple Home 简居家具 / 配件报价表`
- 行数：132 行
- 说明文档：`docs/DEALER_PRICE_SOURCE.md`

相关代码：

- `src/pricing.ts` 负责把 `buildBom(config)` 的 BOM 行匹配到经销商报价源。
- `src/App.tsx` 的 BOM 页签支持导入报价源、导出报价源、恢复默认报价。
- `scripts/extract-dealer-price-pdf.py` 负责从当前 PDF 报价表生成报价源 JSON。
- `scripts/verify-price-source.mjs` 验证报价表行数、核心术语和 BOM 匹配结果。

报价状态：

- `sourceExact`：BOM 行直接命中报价表单行。
- `sourceComposite`：BOM 行按报价表多行组合计价，例如下翻门组件。
- `sourceFormula`：BOM 行按公式计价，例如玻璃面积。
- `fallback`：报价源暂时没有匹配项，保留模型默认估算价。

可运行验证：

- `npm.cmd run verify:pricing` 验证默认报价源和关键 BOM 计价。
- `npm.cmd run build` 验证前端能带默认报价源正常构建。

后续换经销商时，优先导出当前报价源 JSON 作为模板，调整 `dealerName`、价格和备注，再从 BOM 页签导入。只要保持材料 `canonicalName` 稳定，产品配件逻辑不需要改。
