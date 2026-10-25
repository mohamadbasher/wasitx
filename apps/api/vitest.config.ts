import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" }, jsc: { parser: { syntax: "typescript", decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: "es2022" } })],
  test: {
    include: ["test/**/*.spec.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/env.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: "forks",
  },
});
