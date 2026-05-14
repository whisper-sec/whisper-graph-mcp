import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
  onSuccess: async () => {
    // Bundle the resource markdown alongside the build; resource-provider.ts
    // reads it at runtime relative to the compiled module.
    cpSync("src/resources/content", "dist/content", { recursive: true });
  },
});
