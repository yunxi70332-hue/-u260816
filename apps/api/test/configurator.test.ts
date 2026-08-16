import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG, normalizeConfig } from "../../../src/model.js";
import { recalculateDesignSnapshot } from "../src/services/configurator.js";

test("persists the designer's physical outer dimensions in the configuration snapshot", () => {
  const config = normalizeConfig({
    ...DEFAULT_CONFIG,
    rowHeights: [350, 350],
    columnWidths: [500, 500],
    depth: 350,
    depthSegments: [350],
    feet: "glides",
    workSurfaces: []
  });

  const calculated = recalculateDesignSnapshot(config as unknown as Record<string, unknown>);

  assert.deepEqual(calculated.configSnapshot.frozenOuterDimensions, {
    width: 1023,
    height: 740,
    depth: 373
  });
});
