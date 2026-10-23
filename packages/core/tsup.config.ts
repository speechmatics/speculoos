import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    validate: "src/validate.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Optional peer: consumers who don't validate shouldn't pay for it.
  external: ["ajv"],
});
