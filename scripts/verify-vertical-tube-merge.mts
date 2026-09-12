// 竖向连通管合并（mergeContinuousVerticalTubes）回归验证：tsx scripts/verify-vertical-tube-merge.mts
import { DEFAULT_CONFIG, normalizeConfig, buildFrameTopology, buildBom, getColumnLineKeyFromPartId, isColumnLineMergeDisabled, setColumnLineMergeDisabled, type CabinetConfig } from "../src/model";

const fail = (msg: string): never => { console.error("❌ " + msg); process.exit(1); };
const ok = (msg: string) => console.log("✅ " + msg);

function twoRow175(): CabinetConfig {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    rowHeights: [175, 175],
    columnWidths: [500],
    depthSegments: [350],
  });
}

const yMerged = (t: { id: string }) => t.id.startsWith("tube:y-merged:");

// ---------- 场景 B：中间高度有横杆/深度管（默认配置）→ 不合并，175+175+球 ----------
{
  const config = twoRow175();
  const topo = buildFrameTopology(config);
  const yTubes = topo.tubes.filter((t) => t.axis === "y");
  const merged = topo.tubes.filter(yMerged);
  if (merged.length !== 0) fail(`B: 默认有中间杆时不应合并，却出现 ${merged.length} 根合并管`);
  if (yTubes.length !== 8 || !yTubes.every((t) => t.length === 175)) fail(`B: 期望 8 根 175 竖管，实际 ${yTubes.map((t) => t.length).join(",")}`);
  const midBalls = topo.vertices.filter((v) => v.id.includes(":1:plane:") && v.position[1] === 175);
  if (midBalls.length !== 4) fail(`B: 期望 4 个中间球，实际 ${midBalls.length}`);
  ok(`B: 默认中间有杆 → 8×175 竖管 + 4 中间球，不合并`);
}

// ---------- 场景 A：删掉中间高度所有杆 → 四角柱合并为整根 350，中间球消失 ----------
{
  const config = twoRow175();
  const before = buildFrameTopology(config);
  const midTubes = before.tubes.filter((t) => t.axis !== "y" && t.vertexIds.some((id) => id.endsWith(":1:plane:") || /:1:plane:/.test(id)));
  // 取“中间高度(row 边界 y=1)”的杆：x 杆 tube:x:c:1:* 与 z 杆 tube:z:x:1:*:*
  const ids = new Set(before.tubes.filter((t) => (t.id.startsWith("tube:x:0:1:") || /^tube:z:\d+:1:/.test(t.id)) && t.axis !== "y").map((t) => t.id));
  if (ids.size !== 4) fail(`A: 预期 4 根中间高度杆（前后横杆+左右深度杆），实际 ${ids.size}: ${[...ids].join(" | ")}`);
  const overrides: Record<string, { deleted: true }> = {};
  ids.forEach((id) => { overrides[id] = { deleted: true }; });
  const config2 = normalizeConfig({ ...config, framePartOverrides: overrides });
  const topo = buildFrameTopology(config2);

  const merged = topo.tubes.filter(yMerged);
  if (merged.length !== 4) fail(`A: 期望 4 根 350 连通管，实际 ${merged.length}`);
  if (!merged.every((t) => t.length === 350)) fail(`A: 合并管长度错误: ${merged.map((t) => t.length).join(",")}`);
  if (!merged.every((t) => t.vertexIds.every((v) => topo.vertices.some((vv) => vv.id === v)))) fail("A: 合并管端点球缺失");
  const seg175 = topo.tubes.filter((t) => t.axis === "y" && !yMerged(t));
  if (seg175.length !== 0) fail(`A: 不应残留 175 竖管，实际 ${seg175.length}`);
  const midBalls = topo.vertices.filter((v) => /vertex:\d+:1:plane:/.test(v.id));
  if (midBalls.length !== 0) fail(`A: 中间球应被移除，实际剩 ${midBalls.length}`);
  // 面板 supportTubeIds：被合并的旧竖管 id 应已重映射（x/z 引用删除属原有行为，不校验）
  const staleY = topo.panels.flatMap((p) => p.supportTubeIds).filter((id) => /^tube:y:\d+:\d+:/.test(id));
  if (staleY.length) fail(`A: 面板仍引用未重映射的旧竖管 id: ${staleY.join(",")}`);
  if (!topo.panels.some((p) => p.supportTubeIds.some((id) => id.startsWith("tube:y-merged:")))) fail("A: 面板应引用合并后的连通管 id");
  // 端点球连接回填正确
  merged.forEach((t) => t.vertexIds.forEach((vid) => {
    const v = topo.vertices.find((vv) => vv.id === vid)!;
    if (!v.connectedTubeIds.includes(t.id)) fail(`A: 端点球 ${vid} 未回填连通管 ${t.id}`);
  }));
  // BOM：合并后不应再有 175 规格钢管，350 规格存在（BOM spec 为扣除球座的下料长度，按 specKey 归组）
  const bom = buildBom(config2);
  if (bom.some((item) => item.specKey === "175-mm")) fail("A: 合并后 BOM 不应存在 175 规格钢管");
  const tubeItem = bom.find((item) => item.specKey === "350-mm");
  if (!tubeItem) fail("A: BOM 缺少 350 规格钢管行");
  ok(`A: 删除中间杆后 → 4 根整管 350，中间球移除，面板引用已重映射，BOM 含 ${tubeItem?.specKey}（下料 ${tubeItem?.spec}）×${tubeItem?.qty}`);
}

// ---------- 场景 D：还原参考图 2×2 —— 只有外侧柱线无中间杆 → 外侧合并、正中保持拼接 ----------
{
  const config = normalizeConfig({
    ...DEFAULT_CONFIG,
    rowHeights: [175, 175],
    columnWidths: [500, 500],
    depthSegments: [350],
  });
  const base = buildFrameTopology(config);
  // 中间高度(y=1)的杆：横杆 tube:x:0:1 / tube:x:1:1（前后两平面），深度杆 tube:z:*:1:*
  const midIds = base.tubes.filter((t) => t.axis !== "y" && (/:1:plane:|^tube:z:\d+:1:/.test(t.id))).map((t) => t.id);
  const overrides: Record<string, { deleted: true }> = {};
  // 只删左右外侧柱线（x=±500）上的中间杆：左外柱横杆 tube:x:0:1、右外柱横杆 tube:x:1:1，及外侧深度杆 tube:z:0:1 / tube:z:2:1
  midIds.filter((id) => /^tube:x:[01]:1:/.test(id) || /^tube:z:[02]:1:/.test(id)).forEach((id) => { overrides[id] = { deleted: true }; });
  const config2 = normalizeConfig({ ...config, framePartOverrides: overrides });
  const topo = buildFrameTopology(config2);
  const merged = topo.tubes.filter(yMerged);
  if (merged.length !== 4) fail(`D: 期望外侧 4 根整管 350，实际 ${merged.length}（${merged.map((t) => `${t.position[0]}|${t.position[2]}`).join(" ; ")}）`);
  if (!merged.every((t) => t.length === 350)) fail("D: 合并管长度应为 350");
  if (!merged.every((t) => Math.abs(t.position[0]) === 500)) fail("D: 合并只应发生在外侧柱线");
  // 正中柱线（x=0）应保持 175+175+球
  const centerY = topo.tubes.filter((t) => t.axis === "y" && !yMerged(t) && t.position[0] === 0);
  if (centerY.length !== 4 || !centerY.every((t) => t.length === 175)) fail(`D: 正中柱线应保持 4×175，实际 ${centerY.map((t) => t.length).join(",")}`);
  const centerBalls = topo.vertices.filter((v) => v.position[0] === 0 && v.position[1] === 175);
  if (centerBalls.length !== 2) fail(`D: 正中应保留 2 个中间球，实际 ${centerBalls.length}`);
  ok(`D: 2×2 场景 → 外侧 4 柱整根 350，正中柱 175+175+球（与参考图一致）`);
}

// ---------- 场景 C：回归 —— rowHeights=[350] 单层，无合并行为 ----------
{
  const config = normalizeConfig({
    ...DEFAULT_CONFIG,
    rowHeights: [350],
    columnWidths: [500],
    depthSegments: [350],
  });
  const topo = buildFrameTopology(config);
  if (topo.tubes.filter(yMerged).length !== 0) fail("C: 单层 350 不应产生合并管");
  const y350 = topo.tubes.filter((t) => t.axis === "y" && t.length === 350);
  if (y350.length !== 4) fail(`C: 期望 4 根原生 350 竖管，实际 ${y350.length}`);
  if (topo.supports.length !== 4) fail(`C: 期望 4 个脚垫，实际 ${topo.supports.length}`);
  ok(`C: 单层 350 回归正常（4×350 原生竖管，无合并，脚垫 4）`);
}

// ---------- 场景 E：三层 [175,175,175] 全通 → 合并为一根 525 ----------
{
  const config = normalizeConfig({
    ...DEFAULT_CONFIG,
    rowHeights: [175, 175, 175],
    columnWidths: [500],
    depthSegments: [350],
  });
  const base = buildFrameTopology(config);
  const overrides: Record<string, { deleted: true }> = {};
  base.tubes.filter((t) => t.axis !== "y" && (/^tube:x:\d+:(1|2):|^tube:z:\d+:(1|2):/.test(t.id))).forEach((t) => { overrides[t.id] = { deleted: true }; });
  const topo = buildFrameTopology(normalizeConfig({ ...config, framePartOverrides: overrides }));
  const merged = topo.tubes.filter(yMerged);
  if (merged.length !== 4 || !merged.every((t) => t.length === 525)) fail(`E: 期望 4 根 525 整管，实际 ${merged.map((t) => t.length).join(",")}`);
  ok(`E: 三层全通 → 4 根 525 整管（跨层泛化正确）`);
}

// ---------- 场景 F：删除合并后的整管 → 组成段与中间球一并抑制，不"复活" ----------
{
  const config = twoRow175();
  const base = buildFrameTopology(config);
  const overrides: Record<string, { deleted: true }> = {};
  base.tubes.filter((t) => t.axis !== "y" && (t.id.startsWith("tube:x:0:1:") || /^tube:z:\d+:1:/.test(t.id))).forEach((t) => { overrides[t.id] = { deleted: true }; });
  const mergedOnce = buildFrameTopology(normalizeConfig({ ...config, framePartOverrides: overrides }));
  const mergedId = mergedOnce.tubes.find(yMerged)!.id;
  overrides[mergedId] = { deleted: true };
  const topo = buildFrameTopology(normalizeConfig({ ...config, framePartOverrides: overrides }));
  // 仅被删的那根柱线消失，其余 3 根合并管不受影响
  if (topo.tubes.some((t) => t.id === mergedId)) fail("F: 被删除的合并管不应重新生成");
  const others = mergedOnce.tubes.filter(yMerged).filter((t) => t.id !== mergedId);
  if (others.some((t) => !topo.tubes.some((tt) => tt.id === t.id))) fail("F: 其余合并管不应受影响");
  const [, , delX, delSpan, delPlane] = mergedId.split(":");
  if (topo.tubes.some((t) => t.axis === "y" && t.id.includes(`:${delX}:`) && t.id.endsWith(`:${delPlane}`))) fail("F: 被删柱线的组成段也应一并抑制");
  if (topo.vertices.some((v) => v.id === `vertex:${delX}:1:${delPlane}`)) fail("F: 被删柱线的中间球应一并移除");
  ok(`F: 删除整管 ${mergedId} → 该柱线组成段与中间球级联抑制，其余 3 根不受影响`);
}

console.log("\n全部场景通过 🎉");

// ---------- 场景 G：柱线强制分段开关 → 即使无杆也保持 175+175+球 ----------
{
  const config = twoRow175();
  const base = buildFrameTopology(config);
  const overrides: Record<string, { deleted: true }> = {};
  base.tubes.filter((t) => t.axis !== "y" && (t.id.startsWith("tube:x:0:1:") || /^tube:z:\d+:1:/.test(t.id))).forEach((t) => { overrides[t.id] = { deleted: true }; });
  const probeTubeId = "tube:y:0:0:plane:-175.000";
  const lineKey = getColumnLineKeyFromPartId(probeTubeId);
  if (lineKey !== "0|plane:-175.000") fail(`G: 柱线键解析错误: ${lineKey}`);
  if (getColumnLineKeyFromPartId("vertex:0:1:plane:-175.000") !== lineKey) fail("G: 球节点应解析到同一柱线键");
  if (getColumnLineKeyFromPartId("tube:x:0:1:plane:-175.000") !== null) fail("G: 横杆不应解析出柱线键");
  if (getColumnLineKeyFromPartId("tube:y-merged:0:0-2:plane:-175.000") !== lineKey) fail("G: 合并管应解析到同一柱线键");
  const config2 = normalizeConfig({ ...setColumnLineMergeDisabled({ ...config, framePartOverrides: overrides }, lineKey, true) });
  if (!isColumnLineMergeDisabled(config2, lineKey)) fail("G: 开关未生效");
  const topo = buildFrameTopology(config2);
  const lineY = topo.tubes.filter((t) => t.axis === "y" && t.id.startsWith("tube:y:0:") && t.id.endsWith("plane:-175.000"));
  if (lineY.length !== 2 || !lineY.every((t) => t.length === 175)) fail(`G: 强制分段线应保持 2×175，实际 ${lineY.map((t) => t.length).join(",")}`);
  if (!topo.vertices.some((v) => v.id === "vertex:0:1:plane:-175.000")) fail("G: 强制分段后中间球应保留");
  const merged = topo.tubes.filter(yMerged);
  if (merged.length !== 3) fail(`G: 其余 3 根柱线仍应自动合并，实际 ${merged.length}`);
  ok(`G: 强制分段 → ${lineKey} 保持 2×175+球，其余 3 线照常合并为 350`);
}

// ---------- 场景 H：开关关闭 → 恢复自动合并，覆盖记录清空 ----------
{
  const config = twoRow175();
  const lineKey = "0|plane:-175.000";
  const forced = setColumnLineMergeDisabled(config, lineKey, true);
  const base = buildFrameTopology(forced);
  const overrides: Record<string, { deleted: true }> = {};
  base.tubes.filter((t) => t.axis !== "y" && (t.id.startsWith("tube:x:0:1:") || /^tube:z:\d+:1:/.test(t.id))).forEach((t) => { overrides[t.id] = { deleted: true }; });
  const released = normalizeConfig({ ...setColumnLineMergeDisabled({ ...forced, framePartOverrides: overrides }, lineKey, false) });
  if (released.verticalMergeOverrides && Object.keys(released.verticalMergeOverrides).length) fail("H: 关闭开关后覆盖记录应清空");
  const topo = buildFrameTopology(released);
  const merged = topo.tubes.filter(yMerged);
  if (merged.length !== 4 || !merged.every((t) => t.length === 350)) fail(`H: 关闭开关后应恢复 4 根 350 整管，实际 ${merged.length}`);
  ok(`H: 开关关闭 → ${lineKey} 恢复自动合并为 350`);
}

// ---------- 场景 I：normalize 清洗非法覆盖记录 ----------
{
  const dirty = normalizeConfig({
    ...twoRow175(),
    verticalMergeOverrides: { "0|plane:-175.000": true, "bad-key": true, "1|plane:0.000": false, "": true } as Record<string, boolean>,
  });
  const kept = Object.keys(dirty.verticalMergeOverrides ?? {});
  if (kept.length !== 1 || kept[0] !== "0|plane:-175.000") fail(`I: normalize 应只保留合法键，实际 ${JSON.stringify(kept)}`);
  ok(`I: normalize 清洗非法柱线覆盖键`);
}
