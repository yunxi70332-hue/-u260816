import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const sourcePath = path.join(root, "src", "accessoryCatalog.ts");
const outputPath = path.join(root, "output", "usm-accessory-requirements.json");

const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;

const sandbox = {
  exports: {},
  module: { exports: {} }
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(compiled, sandbox, { filename: sourcePath });

const {
  ACCESSORY_CATEGORIES,
  ACCESSORY_REQUIREMENTS
} = sandbox.module.exports;

const payload = {
  generatedAt: new Date().toISOString(),
  purpose: "USM 4.0 local builder accessory requirements",
  source: "Observed from visible USM configurator categories and rebuilt as original local parametric assets.",
  iconSprite: "public/accessory-icons/usm-accessory-icons.svg",
  effectImageDir: "output/accessory-effects",
  categories: ACCESSORY_CATEGORIES,
  accessories: ACCESSORY_REQUIREMENTS
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${ACCESSORY_REQUIREMENTS.length} accessory requirement records to ${outputPath}`);
