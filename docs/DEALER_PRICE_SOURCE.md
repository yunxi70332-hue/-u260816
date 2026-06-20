# 经销商报价源说明

## 定位

报价表不是产品结构逻辑本身，而是一个可替换的价格参数源。

本地配置器的逻辑分两层：

- `src/model.ts`：决定 USM 模块、异形结构、下翻门、移动托盘、固定托盘、带围边抽屉、玻璃/玻璃门等能不能装，输出工厂 BOM。
- `src/pricing.ts`：把 BOM 行匹配到某个经销商报价源，计算价格，并标记价格来源。

后续不同经销商、不同时间的价格变化，应该通过导入新的报价源 JSON 迭代，不应该直接改结构规则。

## 当前来源

用户提供的桌面快捷方式：

`C:/Users/Administrator/Desktop/设计/TO雷雨配件材料表_20250924183213_加水印 - 快捷方式.lnk`

已解析到 PDF：

`E:/WX/xwechat_files/wxid_meynxx4uddfd22_46ef/msg/file/2026-03/TO雷雨配件材料表_20250924183213_加水印.pdf`

工作区内复制件：

`tmp/price-source/dealer-price-source.pdf`

渲染校准图：

- `tmp/pdfs/dealer-price/page-1.png`
- `tmp/pdfs/dealer-price/page-2.png`
- `tmp/pdfs/dealer-price/page-3.png`

PDF 中文文字层因为内嵌字体映射问题会乱码，所以中文材料术语以渲染图人工校准为准；规格、单位、单价来自表格抽取。

## 已识别材料术语

当前默认报价源是 `Simple Home 简居家具 / 配件报价表`，生成文件为：

`src/data/simple-home-price-source.json`

共 132 行，核心术语归一如下：

| 报价表术语 | canonicalName | 用途 |
| --- | --- | --- |
| 扣板 | `panel` | 金属扣板、背板、底板等普通板件 |
| 门板 | `doorPanel` | 下翻门、上翻门、侧开门的门面板 |
| SU201 | `tube201` | 201 管材价格 |
| SU304 | `tube304` | 304 管材价格，当前 BOM 默认匹配此类 |
| 拼接-椭圆管 | `spliceOvalTube` | 拼接管，价格规则为对应基础管 + 1 |
| 黄铜球 | `brassBall` | 球节点 |
| 膨胀套件 | `expansionSet` | 管件安装五金 |
| 脚轮 | `caster` | 柜体底部脚轮 |
| 脚垫 | `glide` | 柜体底部脚垫 |
| 下翻门铰链 | `dropDoorHinge` | 下翻门五金，1 个门板用 2 只 |
| 阻尼器 | `damper` | 门/翻门阻尼 |
| 一元锁+锁盒 | `coinLockBox` | 普通门锁盒 |
| 钥匙锁+锁盒 | `keyLockBox` | 钥匙锁盒 |
| 层板 | `shelfPanel` | 固定层板，报价表备注含五金固定件 |
| 托盘 | `tray` | 移动托盘/展示托盘基础价格 |
| 抽屉 | `drawer` | 带围边抽屉套件 |
| T型件 | `tFitting` | 抽屉/围边相关连接件 |
| 不锈钢拉手 | `stainlessHandle` | 门用不锈钢拉手 |
| 玻璃 | `glass` | 玻璃，按平方米计价 |
| 玻璃拉手 | `glassHandle` | 玻璃门拉手 |
| 玻璃夹 | `glassClip` | 玻璃夹 |
| 玻璃门转 | `glassDoorPivotSet` | 玻璃门转轴套 |
| 扣板门转 | `panelDoorPivotSet` | 扣板门转轴套 |
| 国内标准木箱 | `domesticWoodCrate` | 国内木箱，按方计价 |
| 海外标准木箱 | `exportWoodCrate` | 海外木箱，按方计价 |

报价表页脚规则也已记录为变量：

- 人工安装费：配件价格 +5%
- 玻璃安装费：玻璃 +10%

当前页面先展示材料价匹配结果，人工规则保存在报价源 `laborRules` 中，后续可以接到报价汇总策略里。

## 报价源 Schema

经销商报价源是一个 JSON：

```json
{
  "schemaVersion": 1,
  "id": "simple-home-20250924",
  "dealerName": "Simple Home 简居家具",
  "title": "配件报价表",
  "currency": "CNY",
  "generatedAt": "2026-06-04T00:00:00.000Z",
  "laborRules": [
    { "id": "hardwareInstall", "label": "人工安装费", "rate": 0.05, "scope": "hardware" },
    { "id": "glassInstall", "label": "玻璃安装费", "rate": 0.1, "scope": "glass" }
  ],
  "items": [
    {
      "sourceRow": 117,
      "page": 3,
      "name": "下翻门铰链",
      "canonicalName": "dropDoorHinge",
      "spec": "常用",
      "unit": "只",
      "unitPrice": 33,
      "pricingRule": null,
      "note": "1只已含弹簧+五金件；1个门板需用2只"
    }
  ]
}
```

后续换经销商时，最重要的是保持 `canonicalName` 稳定。不同经销商可以改 `dealerName`、`unitPrice`、`note`、`spec`，但同类材料仍用同一个 `canonicalName`，这样 BOM 匹配逻辑不用重写。

## BOM 计价状态

页面 BOM 会显示价格来源状态：

| 状态 | 含义 |
| --- | --- |
| `sourceExact` | BOM 行能直接匹配报价表单行，例如球节点、SU304 管、扣板、托盘、抽屉 |
| `sourceComposite` | BOM 行需要拆成多个报价表材料组合，例如下翻门组件 = 门板 + 2 个下翻门铰链 + 一元锁+锁盒 |
| `sourceFormula` | BOM 行按公式计价，例如玻璃按面积乘以平方米单价 |
| `fallback` | 报价源暂时没有匹配项，保留模型默认估算价 |

CSV 导出会带上 `价格来源`、`来源行`、`价格备注`，方便回查报价表。

## 重新生成

从 PDF 重新生成默认报价源：

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\extract-dealer-price-pdf.py tmp\price-source\dealer-price-source.pdf src\data\simple-home-price-source.json
```

验证报价源和关键匹配：

```powershell
npm.cmd run verify:pricing
```

## 前端迭代方式

在 BOM 页签中：

- `导入报价源`：选择另一份经销商 JSON，当前页面立即用新价格重算。
- `导出报价源`：导出当前报价源，作为给新经销商改价的模板。
- `默认报价`：恢复 `Simple Home 简居家具` 这份默认报价源。

导入的报价源会保存到浏览器 `localStorage`，刷新页面后继续使用。结构配置和报价源是分开保存的，同一个柜体方案可以切换不同经销商价格。
