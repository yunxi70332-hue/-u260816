import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const priceSourcePath = path.join(root, "src", "data", "simple-home-price-source.json");

function loadTs(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;

  const sandbox = {
    console,
    exports: {},
    module: { exports: {} },
    require(id) {
      if (id === "./data/simple-home-price-source.json") {
        return JSON.parse(fs.readFileSync(priceSourcePath, "utf8"));
      }
      return require(id);
    }
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

const source = JSON.parse(fs.readFileSync(priceSourcePath, "utf8"));
assert.equal(source.dealerName, "零件单配", "price source dealer name");
assert.equal(source.title, "配件报价表", "price source title");
assert.equal(source.items.length, 132, "零件单配 price source row count");
assert.deepEqual(
  pick(source, 1),
  { name: "扣板", spec: "735*580", unitPrice: 181.89 },
  "row 1 panel term"
);
assert.deepEqual(
  pick(source, 62),
  { name: "门板", spec: "735*485", unitPrice: 269.12 },
  "row 62 door panel term"
);
assert.deepEqual(
  pick(source, 113),
  { name: "黄铜球", spec: "", unitPrice: 14.85 },
  "row 113 brass ball term"
);
assert.deepEqual(
  pick(source, 123),
  { name: "抽屉", spec: "低/高", unitPrice: 649.6 },
  "row 123 drawer term"
);
assert.deepEqual(
  pick(source, 126),
  { name: "玻璃", spec: "", unitPrice: 408.32 },
  "row 126 glass term"
);

const pricing = loadTs("src/pricing.ts");
const priced = pricing.priceBomItems([
  { name: "球节点", spec: "标准连接球", qty: 8, unit: "个", unitPrice: 88 },
  { name: "横向钢管", spec: "500 mm", qty: 4, unit: "根", unitPrice: 74 },
  { name: "金属扣板", spec: "500 x 350 mm", qty: 5, unit: "块", unitPrice: 210 },
  { name: "外板", spec: "350 x 350 mm", qty: 2, unit: "块", unitPrice: 210 },
  { name: "下翻门", spec: "500 x 350 mm", qty: 1, unit: "扇", unitPrice: 300 },
  { name: "下翻门铰链", spec: "常用", qty: 2, unit: "只", unitPrice: 33 },
  { name: "一元锁", spec: "下翻门用", qty: 1, unit: "个", unitPrice: 0 },
  { name: "锁盒+螺丝", spec: "1锁盒+2颗螺丝/扇", qty: 1, unit: "套", unitPrice: 20 },
  { name: "下翻门组件", spec: "500 x 350 x 500 mm", qty: 1, unit: "套", unitPrice: 700 },
  { name: "跨格桌面", spec: "2500 x 640 x 32 mm", qty: 1, unit: "块", unitPrice: 1280 }
]);

assertPrice(priced, "球节点", 14.85, "sourceExact");
assertPrice(priced, "横向钢管", 25.06, "sourceExact");
assertPrice(priced, "金属扣板", 92.8, "sourceExact");
assertPrice(priced, "外板", 74.24, "sourceExact");
assertPrice(priced, "下翻门", 141.06, "sourceExact");
assertPrice(priced, "下翻门铰链", 61.25, "sourceExact");
assertPrice(priced, "一元锁", 37.12, "sourceExact");
assertPrice(priced, "锁盒+螺丝", 0, "sourceIncluded");
assertPrice(priced, "下翻门组件", 300.68, "sourceComposite");
assertPrice(priced, "跨格桌面", 1280, "fallback");

console.log("Price source verification passed.");
console.log(JSON.stringify({
  dealerName: source.dealerName,
  rows: source.items.length,
  summary: pricing.summarizePriceMatches(priced),
  priced
}, null, 2));

function pick(source, row) {
  const item = source.items.find((entry) => entry.sourceRow === row);
  return { name: item.name, spec: item.spec, unitPrice: item.unitPrice };
}

function assertPrice(items, name, unitPrice, status) {
  const item = items.find((entry) => entry.name === name);
  assert.ok(item, `${name} must exist`);
  assert.equal(item.unitPrice, unitPrice, `${name} unit price`);
  assert.equal(item.priceStatus, status, `${name} price status`);
}
