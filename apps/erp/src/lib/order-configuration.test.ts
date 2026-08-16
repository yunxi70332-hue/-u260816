import assert from "node:assert/strict";
import test from "node:test";
import { projectOrderConfiguration, unavailableOrderConfiguration } from "./order-configuration";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lJ6sWQAAAABJRU5ErkJggg==";

const frozenOrder = {
  snapshot: {
    quote: {
      revision: 7,
      snapshot: {
        previewDataUrl: TINY_PNG_DATA_URL,
        designVersion: {
          version: 4,
          configSnapshot: {
            rowHeights: [350, 350],
            columnWidths: [750, 500],
            depthSegments: [350, 500],
            frameFinish: "graphite",
            feet: "caster-low",
            structureMode: "complete",
            colorScope: "individual",
            panelColor: "#fffef0",
            planCells: [
              [
                [
                  {
                    id: "front-left",
                    kind: "dropDoor",
                    color: "#2255a8",
                    panelColors: { back: "#e8602a" },
                    accessoryColors: { front: "#586840", "loose-handle": "#8ed0f0" },
                    fitting: "rimmedDrawer",
                    interiorAccessories: [{ id: "tray-1", kind: "mobileTray", color: "#f5b8c8" }]
                  },
                  { id: "front-right", kind: "glassPanelModule", color: "#0c0c0c", enabled: false, fitting: "none" }
                ],
                [{ id: "rear-left", kind: "open", color: "#bcc0b8", depth: 500 }, null]
              ],
              [[null, { id: "bottom-right", kind: "shelf", color: "#fafad2" }], [null, null]]
            ],
            workSurfaces: [{
              id: "top-1",
              kind: "deskTop",
              row: 0,
              fromColumn: 0,
              toColumn: 1,
              depth: 500,
              thickness: 19,
              overhangLeft: 10,
              overhangRight: 10,
              color: "#5c3820"
            }]
          },
          bomSnapshot: [
            { color: "#0c0c0c", qty: 3 },
            { color: "#0c0c0c", quantity: 2 }
          ]
        }
      }
    }
  }
};

test("projects the complete nested order configuration snapshot", () => {
  const configuration = projectOrderConfiguration(frozenOrder);

  assert.equal(configuration.available, true);
  assert.equal(configuration.previewDataUrl, TINY_PNG_DATA_URL);
  assert.equal(configuration.snapshotVersion, "4");
  assert.equal(configuration.dimensions, "1273 × 764 × 873 mm");
  assert.equal(configuration.rows, 2);
  assert.equal(configuration.columns, 2);
  assert.deepEqual(configuration.depthSegments, [350, 500]);
  assert.deepEqual(configuration.columnWidths, [750, 500]);
  assert.deepEqual(configuration.rowHeights, [350, 350]);
  assert.equal(configuration.frameFinish, "石墨黑");
  assert.equal(configuration.feet, "低脚轮");
  assert.equal(configuration.structureMode, "完整结构");
  assert.equal(configuration.modules, 3);
  assert.equal(configuration.moduleItems.length, 4);

  const frontLeft = configuration.moduleItems.find((item) => item.id === "front-left");
  assert.deepEqual(frontLeft && {
    row: frontLeft.row,
    column: frontLeft.column,
    depthIndex: frontLeft.depthIndex,
    width: frontLeft.width,
    height: frontLeft.height,
    depth: frontLeft.depth,
    enabled: frontLeft.enabled,
    frontAccessory: frontLeft.frontAccessory,
    fitting: frontLeft.fitting,
    interiorAccessories: frontLeft.interiorAccessories.map((accessory) => accessory.id)
  }, {
    row: 0,
    column: 0,
    depthIndex: 0,
    width: 750,
    height: 350,
    depth: 350,
    enabled: true,
    frontAccessory: "dropDoor",
    fitting: "rimmedDrawer",
    interiorAccessories: ["tray-1"]
  });
  assert.deepEqual(frontLeft?.panelColors, [{ panel: "back", color: "#e8602a" }]);
  assert.equal(frontLeft?.kindLabel, "下翻门模块");
  assert.equal(configuration.moduleItems.find((item) => item.id === "front-right")?.fitting, undefined);

  assert.deepEqual(configuration.workSurfaces, [{
    id: "top-1",
    kind: "deskTop",
    kindLabel: "跨格桌面",
    enabled: true,
    row: 0,
    fromColumn: 0,
    toColumn: 1,
    width: 1270,
    depth: 500,
    thickness: 19,
    color: "#5c3820"
  }]);
});

test("prefers the frozen outer dimensions over a compatibility calculation", () => {
  const order = structuredClone(frozenOrder);
  const configSnapshot = order.snapshot.quote.snapshot.designVersion.configSnapshot as Record<string, unknown>;
  configSnapshot.frozenOuterDimensions = {
    width: 2015,
    height: 812,
    depth: 624
  };

  assert.equal(projectOrderConfiguration(order).dimensions, "2015 × 812 × 624 mm");
});

test("retains every color source with category, location, and BOM quantity", () => {
  const configuration = projectOrderConfiguration(frozenOrder);
  const colorByValue = new Map(configuration.colors.map((color) => [color.value, color]));

  for (const color of ["#fffef0", "#2255a8", "#e8602a", "#586840", "#f5b8c8", "#8ed0f0", "#5c3820", "#0c0c0c"]) {
    assert.ok(colorByValue.has(color), `expected ${color} to be included`);
  }
  assert.ok(colorByValue.get("#fffef0")?.categories.includes("全局面板"));
  assert.ok(colorByValue.get("#2255a8")?.categories.includes("模块颜色"));
  assert.ok(colorByValue.get("#e8602a")?.categories.includes("面板覆盖"));
  assert.ok(colorByValue.get("#586840")?.categories.includes("前脸配件"));
  assert.ok(colorByValue.get("#f5b8c8")?.categories.includes("内部配件"));
  assert.ok(colorByValue.get("#8ed0f0")?.categories.includes("配件颜色"));
  assert.ok(colorByValue.get("#5c3820")?.categories.includes("工作台面"));
  assert.equal(colorByValue.get("#0c0c0c")?.bomQuantity, 5);
  assert.ok(colorByValue.get("#e8602a")?.positions.some((position) => position.includes("背板")));
  assert.ok(colorByValue.get("#5c3820")?.positions.some((position) => position.includes("第1层")));
});

test("reports an unavailable configuration without fabricated fallback values", () => {
  const configuration = projectOrderConfiguration({ snapshot: { quote: { snapshot: { designVersion: {} } } } });
  const directUnavailable = unavailableOrderConfiguration("missing", "9");

  assert.equal(configuration.available, false);
  assert.equal(configuration.previewDataUrl, null);
  assert.equal(configuration.modules, 0);
  assert.equal(configuration.dimensions, "-");
  assert.deepEqual(configuration.moduleItems, []);
  assert.deepEqual(configuration.colors, []);
  assert.match(configuration.unavailableReason ?? "", /没有可用配置快照/);
  assert.equal(directUnavailable.available, false);
  assert.equal(directUnavailable.snapshotVersion, "9");
});

test("skips a malformed quote preview and uses a valid legacy preview", () => {
  const order = structuredClone(frozenOrder);
  order.snapshot.quote.snapshot.previewDataUrl = "data:image/webp;base64,bm90IGFuIGltYWdl";
  Object.assign(order.snapshot.quote.snapshot.designVersion, { previewDataUrl: TINY_PNG_DATA_URL });

  assert.equal(projectOrderConfiguration(order).previewDataUrl, TINY_PNG_DATA_URL);
});

test("labels a back-facing metal module as a front-panel module", () => {
  const order = structuredClone(frozenOrder);
  const configSnapshot = order.snapshot.quote.snapshot.designVersion.configSnapshot as Record<string, unknown>;
  const planCells = configSnapshot.planCells as unknown[][][];
  planCells[0][0][0] = { id: "front-shell", kind: "metalBackModule", faceSide: "front" };
  planCells[0][1][0] = { id: "back-shell", kind: "metalBackModule", faceSide: "back" };

  const configuration = projectOrderConfiguration(order);

  assert.equal(configuration.moduleItems.find((item) => item.id === "front-shell")?.kindLabel, "含金属背板模块");
  assert.equal(configuration.moduleItems.find((item) => item.id === "back-shell")?.kindLabel, "含金属前板模块");
});

test("projects a legacy back-mounted drop door without replacing frozen order data", () => {
  const order = structuredClone(frozenOrder);
  const configSnapshot = order.snapshot.quote.snapshot.designVersion.configSnapshot as Record<string, unknown>;
  const planCells = configSnapshot.planCells as unknown[][][];
  planCells[0][0][0] = {
    id: "legacy-back-door",
    kind: "metalBackModule",
    frontAccessory: "dropDoor",
    accessoryMountSide: "back",
    color: "#2255a8",
    accessoryColors: { front: "#586840" }
  };

  const item = projectOrderConfiguration(order).moduleItems.find((module) => module.id === "legacy-back-door");

  assert.equal(item?.kind, "metalBackModule");
  assert.equal(item?.kindLabel, "含金属前板模块");
  assert.equal(item?.frontAccessory, "dropDoor");
  assert.equal(item?.frontAccessoryLabel, "下翻门 · 后向");
  assert.equal(item?.color, "#2255a8");
});

test("adds the physical direction to drop-door and rimless-drawer labels", () => {
  const order = structuredClone(frozenOrder);
  const configSnapshot = order.snapshot.quote.snapshot.designVersion.configSnapshot as Record<string, unknown>;
  const planCells = configSnapshot.planCells as unknown[][][];
  planCells[0][0][0] = {
    id: "front-door",
    kind: "metalBackModule",
    frontAccessory: "dropDoor",
    faceSide: "front",
    accessoryMountSide: "front"
  };
  planCells[0][1][0] = {
    id: "back-door",
    kind: "metalBackModule",
    frontAccessory: "dropDoor",
    faceSide: "back",
    accessoryMountSide: "front"
  };
  planCells[0][0][1] = {
    id: "front-drawer",
    kind: "metalBackModule",
    fitting: "rimlessDrawer",
    faceSide: "front",
    accessoryMountSide: "front"
  };
  planCells[0][1][1] = {
    id: "back-drawer",
    kind: "metalBackModule",
    fitting: "rimlessDrawer",
    faceSide: "back",
    accessoryMountSide: "front"
  };

  const modules = projectOrderConfiguration(order).moduleItems;

  assert.equal(modules.find((item) => item.id === "front-door")?.frontAccessoryLabel, "下翻门 · 前向");
  assert.equal(modules.find((item) => item.id === "back-door")?.frontAccessoryLabel, "下翻门 · 后向");
  assert.equal(modules.find((item) => item.id === "front-drawer")?.fittingLabel, "无边抽屉 · 前向");
  assert.equal(modules.find((item) => item.id === "back-drawer")?.fittingLabel, "无边抽屉 · 后向");
});
