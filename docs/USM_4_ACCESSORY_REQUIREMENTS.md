# USM 4.0 本地化搭建配件需求清单

## 目标

基于 USM 配置器页面的可见配件分类和成品效果，建立本地原创参数化模型库。当前版本不复制远端原始 3D 文件，而是记录配件参数、图标线索、交互后的最终效果，并在 Three.js 场景中复刻可用于开发验证的模型形态。

## 本地资产

- 配件数据源：`src/accessoryCatalog.ts`
- 3D 原创渲染：`src/BuilderScene.tsx`
- 配置/BOM 逻辑：`src/model.ts`
- 本地图标 sprite：`public/accessory-icons/usm-accessory-icons.svg`
- 应用内导出：`usm-config.json`、`usm-bom.csv`、`usm-accessory-requirements.json`、`usm-3d-preview.png`

## 已记录配件

| ID | 分类 | 名称 | 参数 | 本地图标 | 最终效果 |
| --- | --- | --- | --- | --- | --- |
| metalBackModule | 结构模块 | 含金属背板模块 | width, height, depth, panelColor, frameFinish | `#metalBackModule` | 单元成为完整金属内胆箱体，正面开放。 |
| noBackModule | 结构模块 | 不含背板模块 | width, height, depth, panelColor, frameFinish | `#noBackModule` | 形成双面开放的通透单元。 |
| glassPanelModule | 结构模块 | 含玻璃板模块 | width, height, depth, glassTint, frameFinish | `#glassPanelModule` | 柜格变为透明展示格。 |
| dropDoor | 门 | 下翻门 | width, height, panelColor, doorState, openingAngle, lockPosition | `#dropDoor` | 三态参数化下翻门：关闭、半开、全开，半开时露出金属内胆和两侧支撑五金。 |
| flipUpDoor | 门 | 上翻门 | width, height, panelColor, openingAngle, topHinge | `#flipUpDoor` | 门板悬在格口上方。 |
| sideOpenDoor | 结构模块 | 不含侧板模块 | width, height, depth, panelColor, frameFinish | `#sideOpenDoor` | 顶部和底部保留金属板，左右侧面与背面开放。 |
| glassDropDoor | 门 | 玻璃门 | width, height, glassTint, frameFinish, openingAngle | `#glassDropDoor` | 正面为透明玻璃门。 |
| openBackPanel | 门 | 金属背板 | width, height, panelColor | `#openBackPanel` | 开放格增加金属背板。 |
| sidePanel | 门 | 侧板 | height, depth, panelColor, side | `#sidePanel` | 单侧被金属板封闭。 |
| softPanelLow | USM Soft Panel | 低软包板 | width, heightRatio, fabricColor, backMount | `#softPanelLow` | 后下方出现深色软包板。 |
| softPanelWide | USM Soft Panel | 宽软包板 | width, heightRatio, fabricColor, backMount | `#softPanelWide` | 背部出现横向吸音板。 |
| softPanelTall | USM Soft Panel | 高软包板 | widthRatio, height, fabricColor, backMount | `#softPanelTall` | 背部出现竖向软包板。 |
| shelf | 搁板和抽屉 | 固定搁板 | width, depth, panelColor, heightPosition | `#shelf` | 单元中间出现固定层板。 |
| pullOutShelf | 搁板和抽屉 | 移动托盘 | width, depth, extension, railLength | `#pullOutShelf` | 移动托盘伸出柜体前方。 |
| boxDrawer | 搁板和抽屉 | 抽屉盒 | width, height, depth, railLength, frontColor | `#boxDrawer` | 格子内出现半拉出的抽屉盒。 |
| displayTray | 搁板和抽屉 | 展示托盘 | width, depth, rimHeight, panelColor | `#displayTray` | 格子中出现浅托盘。 |
| glassShelf | 搁板和抽屉 | 玻璃搁板 | width, depth, glassTint, heightPosition | `#glassShelf` | 单元内出现透明玻璃隔板。 |
| glideFoot | 底部支撑 | 调平脚垫 | height, diameter, rubberColor | `#glideFoot` | 底部为低矮黑色调平脚。 |
| casterFoot | 底部支撑 | 脚轮 | wheelRadius, bracketHeight, rubberColor, metalFinish | `#casterFoot` | 柜体底部出现可移动滚轮。 |

## 4.0 开发要求

1. 配件必须由参数驱动，至少包含宽、高、深、颜色/材质、安装位置和开启/拉出状态。
2. 每个配件需要同时具备列表图标、BOM 名称、估价单元、3D 最终效果。
3. 门类配件要支持开启状态：下翻、上翻、玻璃门。
4. 内部配件要支持半成品效果：移动托盘、半拉抽屉、展示托盘、玻璃搁板。
5. Soft Panel 需要保留布面粗糙材质、深色外观和不同宽高比例。
6. 柜体结构支持逐格启用/删除，向左、右、上和加深扩展，方便本地搭建非矩形方案。
7. 远端配置器如卡在加载页或蓝色空场景，刷新后继续；同一入口连续卡顿超过五次，切换到 `https://webconfigurator.usm.com/usmconfig/pages.mainUIWeb.risc`。

## 待继续学习

- 逐个点击远端配置器里灰掉或滚动后才出现的隐藏配件。
- 为每个远端点击状态保存截图，补充到 `output/` 作为视觉参考。
- 如发现新配件，先追加 `src/accessoryCatalog.ts`，再补 `BuilderScene.tsx` 的几何分支，最后构建验证。
