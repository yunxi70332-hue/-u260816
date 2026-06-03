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
  frameFinish: "chrome" | "graphite";
  feet: "glides" | "casters";
  showDimensions: boolean;
  cells: CellConfig[][];
}
```

解释：

- `depth`：整体深度，当前支持 250 / 350 / 500 mm
- `columnWidths`：每一列的宽度数组
- `rowHeights`：每一层的高度数组
- `panelColor`：板件颜色
- `frameFinish`：钢管表面，镀铬或石墨
- `feet`：脚垫或滚轮
- `showDimensions`：是否显示尺寸标注
- `cells`：二维格子配置，行列对应每个模块格

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
- 最多 5

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
| 开放格 | 底板/开放空间 |
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
- 脚垫/滚轮按底部支撑点计算
- 不同格子类型增加对应板件和五金

不同格子的 BOM 增量：

- 背板格：金属背板
- 下翻门：金属背板、下翻门板、门铰链五金
- 三抽屉：抽屉面板、抽屉导轨
- 玻璃门：玻璃门、玻璃铰链五金
- 托盘格：金属背板、内托盘

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
