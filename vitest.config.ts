import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "#shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  // The storage tests move several MB: room for a slow or busy machine.
  test: { include: ["test/*.test.ts"], testTimeout: 30_000 },
});
