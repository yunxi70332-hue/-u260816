import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(repoRoot, "src", "business");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "usm-business-gateway-"));

try {
  await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ type: "commonjs" }));
  for (const name of ["types", "storage", "adapters", "gateway"]) {
    const source = await fs.readFile(path.join(sourceDir, name + ".ts"), "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true
      },
      fileName: name + ".ts"
    });
    await fs.writeFile(path.join(tempDir, name + ".js"), output.outputText);
  }

  const require = createRequire(import.meta.url);
  const { LocalBusinessAdapter, HttpErpAdapter } = require(path.join(tempDir, "adapters.js"));
  const { BusinessGateway } = require(path.join(tempDir, "gateway.js"));
  const {
    MemoryBusinessStorage,
    PENDING_OPERATIONS_STORAGE_KEY
  } = require(path.join(tempDir, "storage.js"));

  const storage = new MemoryBusinessStorage();
  const adapter = new LocalBusinessAdapter(storage);
  const gateway = new BusinessGateway(adapter, storage, "warehouse-a");
  const bom = [
    { name: "金属板", spec: "500 x 350 mm", color: "白色", qty: 2, unit: "块", unitPrice: 100 },
    { name: "横向钢管", spec: "500 mm", qty: 4, unit: "根", unitPrice: 20 }
  ];

  const firstMaterials = await gateway.resolveMaterials(bom);
  const secondMaterials = await gateway.resolveMaterials(bom);
  assert.equal(firstMaterials.status, "success");
  assert.deepEqual(firstMaterials.data, secondMaterials.data, "物料行 ID 应稳定");
  assert.equal(firstMaterials.data.length, 2);
  assert.equal(firstMaterials.data[0].mappingStatus, "unmatched");
  assert.equal(firstMaterials.data[0].name, "金属板");
  assert.equal(firstMaterials.data[0].spec, "500 x 350 mm");
  assert.equal(firstMaterials.data[0].color, "白色");

  const contextA = gateway.getContext();
  const inventoryA = await gateway.checkInventory(firstMaterials.data, contextA);
  assert.equal(inventoryA.status, "unavailable");
  assert.ok(inventoryA.data.every((item) => item.status === "unknown"));
  assert.ok(inventoryA.data.every((item) => item.warehouseId === "warehouse-a"));

  const contextB = gateway.setWarehouse("warehouse-b");
  const inventoryB = await gateway.checkInventory(firstMaterials.data, contextB);
  assert.ok(inventoryB.data.every((item) => item.warehouseId === "warehouse-b"));
  assert.ok(inventoryA.data.every((item) => item.warehouseId === "warehouse-a"), "不同仓库结果不能串写");

  const reloadedGateway = new BusinessGateway(new LocalBusinessAdapter(storage), storage, "unused-default");
  assert.equal(reloadedGateway.getContext().warehouseId, "warehouse-b", "仓库上下文应独立持久化");

  const configSnapshot = { panelColor: "white", columnWidths: [500], rowHeights: [350], cells: [[{ kind: "open", enabled: true }]] };
  const draft = {
    clientRequestId: "client-order-001",
    warehouseId: "warehouse-b",
    configVersion: "4.22.0",
    configSnapshot,
    bomSnapshot: bom,
    requirements: firstMaterials.data,
    note: "offline test"
  };
  const firstOrder = await gateway.createProductionOrder(draft, contextB);
  const repeatedOrder = await gateway.createProductionOrder(draft, contextB);
  assert.equal(firstOrder.status, "unavailable");
  assert.equal(firstOrder.data.status, "queued");
  assert.equal(firstOrder.data.localOperationId, repeatedOrder.data.localOperationId, "重复提交必须复用幂等 ID");

  const queuedBeforeMutation = adapter.getPendingOperations();
  assert.equal(queuedBeforeMutation.length, 1, "重复提交不能增加队列记录");
  configSnapshot.panelColor = "black";
  bom[0].qty = 99;
  const queuedAfterMutation = adapter.getPendingOperations();
  assert.equal(queuedAfterMutation[0].payload.configSnapshot.panelColor, "white", "订单配置必须保存提交时快照");
  assert.equal(queuedAfterMutation[0].payload.bomSnapshot[0].qty, 2, "订单 BOM 必须保存提交时快照");

  const retry = await gateway.retryPendingOperations();
  const queuedAfterRetry = adapter.getPendingOperations();
  assert.equal(retry.status, "unavailable");
  assert.equal(retry.data.attempted, 1);
  assert.equal(queuedAfterRetry[0].operationId, firstOrder.data.localOperationId, "重试不能更换操作 ID");
  assert.equal(queuedAfterRetry[0].retryCount, 1);
  assert.equal(JSON.parse(storage.getItem(PENDING_OPERATIONS_STORAGE_KEY)).length, 1);

  const fetchedOrder = await gateway.getProductionOrder(firstOrder.data.localOperationId, contextB);
  assert.equal(fetchedOrder.data.status, "queued");
  const wrongWarehouseOrder = await gateway.getProductionOrder(firstOrder.data.localOperationId, contextA);
  assert.equal(wrongWarehouseOrder.status, "error", "订单查询必须按仓库隔离");

  const httpAdapter = new HttpErpAdapter();
  const httpResult = await httpAdapter.checkInventory(firstMaterials.data, contextB);
  assert.equal(httpResult.status, "unavailable");
  assert.deepEqual(httpResult.data, []);

  console.log("Business gateway verification passed: material mapping, warehouse isolation, offline queue, snapshots, idempotency, retry, HTTP placeholder.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
