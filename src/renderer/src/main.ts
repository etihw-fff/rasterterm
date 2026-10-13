import "./styles/main.scss";

import { startApp } from "./app";

void startApp().catch((error: unknown) => {
  console.error("RasterTermの初期化に失敗しました:", error);
});
