import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/bootstrap.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  noExternal: ["@usm/contracts", "@usm/domain"]
});
