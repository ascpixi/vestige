import * as vite from "vite";
import * as vitest from "vitest/config";
import react from "@vitejs/plugin-react";

const tauriCfg = !process.env.TAURI_ENV_PLATFORM ? {} : {
  // https://v2.tauri.app/start/frontend/vite/

  clearScreen: false, // prevent vite from obscuring rust errors
  server: {
    // Tauri expects a fixed port, fail if that port is not available
    strictPort: true,
    // if the host Tauri is expecting is set, use it
    host: process.env.TAURI_DEV_HOST || false,
    port: 5173,
  },
  // Env variables starting with the item of `envPrefix` will be exposed in tauri's source code through `import.meta.env`.
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari14",

    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  }
} satisfies Partial<vite.UserConfig>;

const viteCfg = vite.defineConfig({
  plugins: [react()],
  base: "/",
  ...tauriCfg
});

const vitestCfg = vitest.defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      name: "chrome",
      provider: "webdriverio",
      screenshotFailures: false
    }
  }
})

export default vite.mergeConfig(viteCfg, vitestCfg); 