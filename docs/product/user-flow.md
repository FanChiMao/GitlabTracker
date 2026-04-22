# User Flow

逐步說明每個使用者操作的步驟與對應 API。前端入口都在 [renderer/index.html](../../renderer/index.html) + [renderer/app.ts](../../renderer/app.ts)。

## 1. 設定 GitLab 連線

| 步驟 | UI 元素 | 行為 |
| --- | --- | --- |
| 1 | 側邊欄「GitLab 設定」 | 預設展開 |
| 2 | 輸入 `GitLab Base URL`、`Private Token`、`Project Path / ID` | `<input id="gitlab-url">` 等 |
| 3 | （選填）輸入 `Gemini API Key` | 啟用 AI 功能 |
| 4 | 設定每日同步 / 週五週報時間與開關 | `time` input |
| 5 | 按「儲存設定」 | `POST /api/config`，若 `project_ref` 改變會清空 cache |
| 6 | 按「立即同步」 | `POST /api/fetch`，成功後刷新 Dashboard |

## 2. 瀏覽 Dashboard

| 步驟 | 動作 |
| --- | --- |
| 1 | 啟動 App 自動載入 `GET /api/dashboard` + `/api/issues` |
| 2 | 看到 4 個 KPI 卡（本週新增 / 更新 / 開啟中 / 風險） |
| 3 | 「近期更新 Issue」可調整「近 N 小時」視窗 |
| 4 | 「本週新增」「重點推進」「風險」「模組分佈」分區呈現 |
| 5 | 點任意 Issue 列開啟右側抽屜（含描述、Discussions、MR、Linked Issues） |

## 3. 切換到 Analytics

| 步驟 | 動作 |
| --- | --- |
| 1 | 點上方 Tab「分析」 |
| 2 | 觸發 `GET /api/analytics`（首次切換才呼叫，之後快取） |
| 3 | 看到：Burndown 圖（per milestone） / Workload 表 / Label 分佈 / Lifecycle / Delivery follow-ups |

## 4. Issue 抽屜內 AI 摘要

| 步驟 | 動作 | API |
| --- | --- | --- |
| 1 | 在抽屜按「AI 摘要討論」 | — |
| 2 | UI 顯示 loading | `POST /api/issues/{iid}/discussions/summary` |
| 3 | 後端從 GitLab 抓 discussions → 組 prompt → 呼叫 Gemini → 解析 JSON | — |
| 4 | 顯示條列摘要（討論重點 / 決議事項 / 待釐清） | — |

> 若沒設 `gemini_api_key` 會回 400，前端顯示提示。

## 5. AI Chat 問答

| 步驟 | 動作 |
| --- | --- |
| 1 | 點 Tab「AI 助理」（或 dashboard 上的對話按鈕） |
| 2 | 輸入問題（例：「Bob 這週有哪幾張開啟中的 Issue？」） |
| 3 | 前端把最近 10 筆對話 + 新問題打包送 `POST /api/chat` |
| 4 | 後端組「Issue 列表 context + 系統指令」→ 呼叫 Gemini → 回傳 `answer` |
| 5 | UI 顯示回答；引用的 `#42` 文字會被前端轉成可點擊連結 |

## 6. 產生 / 匯出週報

| 步驟 | 動作 | API |
| --- | --- | --- |
| 1 | 側欄按「立即產生週報」 | `POST /api/report/weekly` |
| 2 | 後端寫 `reports/weekly_report_*.md` 並回傳 path | — |
| 3 | 按「開啟最新週報」 | `ipcRenderer.invoke('shell:openPath', path)` |
| 4 | 按「匯出 PDF 報告」 | `GET /api/report/html` → `ipc report:exportPdf` |
| 5 | 系統顯示「另存新檔」 → 寫入 PDF → 自動開啟 | — |

## 7. 縮放與外部連結

- `Ctrl +` / `Ctrl -` / `Ctrl 0`：縮放（0.8x – 1.6x）。
- 點擊任一 GitLab 連結 → 跳出對話框「Chrome / Edge / 預設瀏覽器 / 取消」，可勾選「記住選擇」存到 `external-link-preferences.json`。
