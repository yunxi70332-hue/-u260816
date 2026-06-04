export type AccessoryCategoryId = "modules" | "doors" | "softPanels" | "shelvesDrawers" | "support";

export type AccessoryModelKind =
  | "metalBackModule"
  | "noBackModule"
  | "glassPanelModule"
  | "dropDoor"
  | "flipUpDoor"
  | "sideOpenDoor"
  | "glassDropDoor"
  | "openBackPanel"
  | "sidePanel"
  | "softPanelLow"
  | "softPanelWide"
  | "softPanelTall"
  | "shelf"
  | "pullOutShelf"
  | "boxDrawer"
  | "displayTray"
  | "glassShelf"
  | "glideFoot"
  | "casterFoot";

export interface AccessoryCatalogItem {
  id: AccessoryModelKind;
  category: AccessoryCategoryId;
  name: string;
  shortName: string;
  installTarget: "cell" | "frame" | "bottom";
  observedFrom: string;
  parameters: string[];
  localModel: string;
  iconHint: string;
  finalEffect: string;
  bomName: string;
  unit: string;
  unitPrice: number;
}

export interface AccessoryRequirementRecord extends AccessoryCatalogItem {
  icon: `#${AccessoryModelKind}`;
  iconSprite: string;
  effectImage: string;
  modeledStatus: "modeled-local";
  evidenceStatus: "visual-captured";
}

export const ACCESSORY_CATEGORIES: Array<{ id: AccessoryCategoryId; label: string }> = [
  { id: "modules", label: "结构模块" },
  { id: "doors", label: "门" },
  { id: "softPanels", label: "USM Soft Panel" },
  { id: "shelvesDrawers", label: "搁板和抽屉" },
  { id: "support", label: "底部支撑" }
];

export const ACCESSORY_CATALOG: AccessoryCatalogItem[] = [
  {
    id: "metalBackModule",
    category: "modules",
    name: "含金属背板模块",
    shortName: "金属",
    installTarget: "cell",
    observedFrom: "结构/门类缩略图：标准开放箱体，背面和内侧为浅色金属板。",
    parameters: ["width", "height", "depth", "panelColor", "frameFinish"],
    localModel: "背板、左右侧扣板、顶板、底板，保留球节点和钢管。",
    iconHint: "open cube with metallic back and side panels",
    finalEffect: "单元成为完整金属内胆箱体，正面开放。",
    bomName: "含金属背板模块",
    unit: "套",
    unitPrice: 980
  },
  {
    id: "noBackModule",
    category: "modules",
    name: "不含背板模块",
    shortName: "无背",
    installTarget: "cell",
    observedFrom: "结构/门类缩略图：开放箱体，背面无板。",
    parameters: ["width", "height", "depth", "panelColor", "frameFinish"],
    localModel: "左右侧板、顶板、底板，背面完全开放。",
    iconHint: "open cube without back panel",
    finalEffect: "形成双面开放的通透单元。",
    bomName: "无背板模块",
    unit: "套",
    unitPrice: 760
  },
  {
    id: "glassPanelModule",
    category: "modules",
    name: "含玻璃板模块",
    shortName: "玻板",
    installTarget: "cell",
    observedFrom: "结构/门类缩略图：浅蓝透明箱体。",
    parameters: ["width", "height", "depth", "glassTint", "frameFinish"],
    localModel: "顶、底、侧、背均为半透明玻璃面板，边缘带蓝色高光。",
    iconHint: "transparent cyan glass cube",
    finalEffect: "柜格变为透明展示格，可看见框架和内部层板。",
    bomName: "玻璃板模块",
    unit: "套",
    unitPrice: 1260
  },
  {
    id: "dropDoor",
    category: "doors",
    name: "下翻门",
    shortName: "下翻",
    installTarget: "cell",
    observedFrom: "门分组第一排：整面板前门，底部铰链，下翻开启效果。",
    parameters: ["width", "height", "panelColor", "doorState", "openingAngle", "lockPosition"],
    localModel: "三态参数化下翻门：含金属背板模块内胆、底部铰链轴、左右限位支撑、细金属门边和圆形锁点，支持关闭/半开/全开。",
    iconHint: "front panel tilted down with one dark hinge line",
    finalEffect: "门板可在关闭、半开、全开之间切换；半开时门板向前下方倾斜并露出金属内胆和两侧支撑五金。",
    bomName: "下翻门组件",
    unit: "套",
    unitPrice: 700
  },
  {
    id: "flipUpDoor",
    category: "doors",
    name: "上翻门",
    shortName: "上翻",
    installTarget: "cell",
    observedFrom: "门分组第一排：门板向上打开的预览图。",
    parameters: ["width", "height", "panelColor", "openingAngle", "topHinge"],
    localModel: "薄金属前板以顶部铰链向外上翻，保留开口内腔。",
    iconHint: "front panel tilted upward",
    finalEffect: "门板悬在格口上方，适合展示开启状态。",
    bomName: "上翻门组件",
    unit: "套",
    unitPrice: 720
  },
  {
    id: "sideOpenDoor",
    category: "doors",
    name: "侧开门",
    shortName: "侧开",
    installTarget: "cell",
    observedFrom: "门分组第一排：门板向侧边打开的深色面板效果。",
    parameters: ["width", "height", "panelColor", "openingAngle", "hingeSide"],
    localModel: "单片门板绕左侧竖向铰链开启，显示内侧暗面。",
    iconHint: "side hinged dark front panel",
    finalEffect: "门板向左外摆，格口保持可见。",
    bomName: "侧开门组件",
    unit: "套",
    unitPrice: 680
  },
  {
    id: "glassDropDoor",
    category: "doors",
    name: "玻璃门",
    shortName: "玻璃",
    installTarget: "cell",
    observedFrom: "门分组第二排：浅蓝透明面板。",
    parameters: ["width", "height", "glassTint", "frameFinish", "openingAngle"],
    localModel: "半透明玻璃前板、细金属边框、轻微蓝色反射。",
    iconHint: "transparent cyan glass front",
    finalEffect: "正面为透明玻璃门，可看到内部背板和搁板。",
    bomName: "玻璃门组件",
    unit: "套",
    unitPrice: 890
  },
  {
    id: "openBackPanel",
    category: "doors",
    name: "金属背板",
    shortName: "背板",
    installTarget: "cell",
    observedFrom: "门分组第二排：无前门但保留后板的浅色模块。",
    parameters: ["width", "height", "panelColor"],
    localModel: "后侧薄板加底板，正面开放。",
    iconHint: "open cube with back panel",
    finalEffect: "开放格增加金属背板，正面仍可直接取物。",
    bomName: "金属背板",
    unit: "块",
    unitPrice: 280
  },
  {
    id: "sidePanel",
    category: "doors",
    name: "侧板",
    shortName: "侧板",
    installTarget: "cell",
    observedFrom: "门分组第二排：单侧封板的开放模块。",
    parameters: ["height", "depth", "panelColor", "side"],
    localModel: "左侧竖向封板，正面开放，用于端部封闭。",
    iconHint: "open cube with one side panel",
    finalEffect: "单侧被金属板封闭，另一侧与正面开放。",
    bomName: "侧封板",
    unit: "块",
    unitPrice: 260
  },
  {
    id: "softPanelLow",
    category: "softPanels",
    name: "低软包板",
    shortName: "低软包",
    installTarget: "cell",
    observedFrom: "USM Soft Panel 分组：低矮黑色吸音/软包板。",
    parameters: ["width", "heightRatio", "fabricColor", "backMount"],
    localModel: "深色纤维软包薄板，斜靠在单元背部下半区。",
    iconHint: "low dark fabric panel",
    finalEffect: "格子后下方出现一块深色软包板。",
    bomName: "低软包板",
    unit: "块",
    unitPrice: 360
  },
  {
    id: "softPanelWide",
    category: "softPanels",
    name: "宽软包板",
    shortName: "宽软包",
    installTarget: "cell",
    observedFrom: "USM Soft Panel 分组：横向黑色板件。",
    parameters: ["width", "heightRatio", "fabricColor", "backMount"],
    localModel: "横向长软包，带布面粗糙材质和细边框。",
    iconHint: "wide dark fabric panel",
    finalEffect: "格子背部出现横向深色吸音板。",
    bomName: "宽软包板",
    unit: "块",
    unitPrice: 430
  },
  {
    id: "softPanelTall",
    category: "softPanels",
    name: "高软包板",
    shortName: "高软包",
    installTarget: "cell",
    observedFrom: "USM Soft Panel 分组：竖向黑色板件。",
    parameters: ["widthRatio", "height", "fabricColor", "backMount"],
    localModel: "竖向软包薄板，覆盖单元背部大部分高度。",
    iconHint: "tall dark fabric panel",
    finalEffect: "格子背部出现竖向深色软包板。",
    bomName: "高软包板",
    unit: "块",
    unitPrice: 470
  },
  {
    id: "shelf",
    category: "shelvesDrawers",
    name: "固定搁板",
    shortName: "搁板",
    installTarget: "cell",
    observedFrom: "搁板和抽屉分组：水平隔板模块。",
    parameters: ["width", "depth", "panelColor", "heightPosition"],
    localModel: "居中水平金属隔板，把单元分成上下两层。",
    iconHint: "single middle shelf",
    finalEffect: "单元中间出现固定层板。",
    bomName: "固定搁板",
    unit: "块",
    unitPrice: 310
  },
  {
    id: "pullOutShelf",
    category: "shelvesDrawers",
    name: "拉出搁板",
    shortName: "拉板",
    installTarget: "cell",
    observedFrom: "搁板和抽屉分组：前方伸出的托板。",
    parameters: ["width", "depth", "extension", "railLength"],
    localModel: "托板向前拉出，左右有短导轨。",
    iconHint: "shelf pulled forward on rails",
    finalEffect: "搁板伸出柜体前方，展示可拉出状态。",
    bomName: "拉出搁板",
    unit: "套",
    unitPrice: 540
  },
  {
    id: "boxDrawer",
    category: "shelvesDrawers",
    name: "抽屉盒",
    shortName: "抽屉",
    installTarget: "cell",
    observedFrom: "搁板和抽屉分组：灰色抽屉盒体。",
    parameters: ["width", "height", "depth", "railLength", "frontColor"],
    localModel: "内置抽屉盒，前面板、盒体和导轨分层建模。",
    iconHint: "box drawer inside cell",
    finalEffect: "格子内出现半拉出的抽屉盒。",
    bomName: "抽屉盒组件",
    unit: "套",
    unitPrice: 760
  },
  {
    id: "displayTray",
    category: "shelvesDrawers",
    name: "展示托盘",
    shortName: "托盘",
    installTarget: "cell",
    observedFrom: "搁板和抽屉分组：浅色开放托盘模块。",
    parameters: ["width", "depth", "rimHeight", "panelColor"],
    localModel: "低边托盘，底板加三面矮挡边。",
    iconHint: "open shallow tray",
    finalEffect: "格子中出现浅托盘，可作为展示或收纳层。",
    bomName: "展示托盘",
    unit: "套",
    unitPrice: 460
  },
  {
    id: "glassShelf",
    category: "shelvesDrawers",
    name: "玻璃搁板",
    shortName: "玻搁",
    installTarget: "cell",
    observedFrom: "搁板和抽屉分组：透明浅蓝搁板效果。",
    parameters: ["width", "depth", "glassTint", "heightPosition"],
    localModel: "半透明玻璃水平板，边缘有浅蓝高光。",
    iconHint: "transparent glass shelf",
    finalEffect: "单元内出现透明玻璃隔板。",
    bomName: "玻璃搁板",
    unit: "块",
    unitPrice: 420
  },
  {
    id: "glideFoot",
    category: "support",
    name: "调平脚垫",
    shortName: "脚垫",
    installTarget: "bottom",
    observedFrom: "当前基础柜底部四角黑色脚垫。",
    parameters: ["height", "diameter", "rubberColor"],
    localModel: "小圆锥脚垫，黑色橡胶材质。",
    iconHint: "small black conical foot",
    finalEffect: "底部为低矮黑色调平脚。",
    bomName: "调平脚垫",
    unit: "个",
    unitPrice: 42
  },
  {
    id: "casterFoot",
    category: "support",
    name: "脚轮",
    shortName: "脚轮",
    installTarget: "bottom",
    observedFrom: "底部支撑配件：移动柜常见滚轮效果。",
    parameters: ["wheelRadius", "bracketHeight", "rubberColor", "metalFinish"],
    localModel: "黑色滚轮加金属支架，分低/高两种高度在模型中缩放。",
    iconHint: "caster wheel and metal bracket",
    finalEffect: "柜体底部出现可移动滚轮支撑。",
    bomName: "脚轮组件",
    unit: "个",
    unitPrice: 150
  }
];

export const ACCESSORY_REQUIREMENTS: AccessoryRequirementRecord[] = ACCESSORY_CATALOG.map((item) => ({
  ...item,
  icon: `#${item.id}`,
  iconSprite: "public/accessory-icons/usm-accessory-icons.svg",
  effectImage: `output/accessory-effects/${item.id}.png`,
  modeledStatus: "modeled-local",
  evidenceStatus: "visual-captured"
}));

export function getAccessory(id: AccessoryModelKind) {
  return ACCESSORY_CATALOG.find((item) => item.id === id) ?? ACCESSORY_CATALOG[0];
}
