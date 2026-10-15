import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDir = resolve(projectRoot, "test-results/wdio");

// Electronパッケージが指定するネイティブ実行ファイルを取得する。
const electronPackageDir = resolve(projectRoot, "node_modules/electron");
const electronRelativeBinary = readFileSync(resolve(electronPackageDir, "path.txt"), "utf8").trim();

const electronBinaryPath = resolve(electronPackageDir, "dist", electronRelativeBinary);

// WDIO forwards Chromedriver CLI options, but its types list only generic driver fields.
const driverOptions = {
  logPath: resolve(projectRoot, "test-results/chromedriver.log"),
  verbose: true,
  allowedIps: ["127.0.0.1"],
  allowedOrigins: ["http://localhost"],
} satisfies WebdriverIO.ChromedriverOptions & {
  verbose: boolean;
  allowedIps: string[];
  allowedOrigins: string[];
};

export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: resolve(projectRoot, "tsconfig.tools.json"),
  specs: ["./tests/e2e/**/*.{e2e,test,spec}.ts"],
  maxInstances: 1,

  capabilities: [
    {
      browserName: "electron",

      // ChromeDriverにはNode.jsラッパーではなく、
      // Electron本体の実行ファイルを使用させる。
      "goog:chromeOptions": {
        binary: electronBinaryPath,
      },

      "wdio:chromedriverOptions": driverOptions,

      "wdio:electronServiceOptions": {
        appEntryPoint: resolve(projectRoot, "out/main/index.js"),
        appArgs: [],
      },
    },
  ],

  services: [["electron", { captureMainProcessLogs: true, captureRendererLogs: true }]],

  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",
  outputDir,

  onPrepare: async () => {
    await mkdir(outputDir, { recursive: true });
  },

  mochaOpts: { timeout: 30000 },
  waitforTimeout: 10000,
};
