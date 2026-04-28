# Gitlab Tracker

Gitlab Tracker 是一個 Electron 桌面 App，前端使用 HTML/CSS/TypeScript，後端使用 Python FastAPI。它把 GitLab Issue 同步、分析儀表板、Issue 整理、AI 摘要與週報輸出整合在同一個工具裡，方便 PM、Tech Lead 與工程團隊在本機快速整理專案現況。

## 目前功能

- Dashboard：顯示本週新增、近期更新、開啟中、風險 Issue。
- Analytics：提供 burndown、工作量、label 分布、生命週期與交付追蹤。
- Timeline / Table：用時間軸與表格方式查看所有 Issue。
- Issue Detail：查看 discussions、related merge requests、linked issues，並可產生 AI 討論摘要。
- AI Chat：直接對整份 Issue 快取資料提問。
- Issue Arrange：貼入多個 Issue URL 或 GitLab filter URL，整理原文、跑 LLM 摘要、批次處理、匯出 Excel，並保留歷史紀錄。
- Reports：產生 Markdown 週報、HTML 報表，並透過 Electron 匯出 PDF。
- Data Source：可直接抓 GitLab API，也可匯入既有 JSON 檔。

## 專案結構

- `src/`: Electron main process 與 preload。
- `frontend/`: partial-based UI、樣式與前端 TypeScript。
- `backend/`: FastAPI、GitLab client、排程、週報與 issue arrange 邏輯。
- `docs/`: 產品、架構、操作與 API 文件。

## 快速開始

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
npm run dev
```

啟動後，Electron 會先拉起本機 FastAPI，等 `http://127.0.0.1:8765/api/health` 正常後再載入 UI。

## 基本使用流程

1. 到 `Connections` 設定 GitLab Base URL、Private Token、Project Path/ID，必要時再填 Gemini API Key。
2. 按 `Sync Now` 抓取最新 Issue，或改用 `Import JSON` 匯入既有資料。
3. 在 `Dashboard`、`Analytics`、`Timeline`、`Table` 追蹤整體進度與風險。
4. 在 `Issue Arrange` 貼入 Issue URL 或 GitLab filter URL，整理 Issue 原文、執行 LLM 摘要，並匯出 Excel。
5. 需要分享時可產生 Markdown / HTML / PDF 報表。

## 資料與輸出

開發模式預設寫入 `backend/data/`，打包後則寫入 Electron `userData/tracker-data/`。

- `config.json`: GitLab 與 Gemini 連線設定。
- `issues_cache.json`: 同步後的 Issue 快取。
- `meta.json`: 最後同步、最後報表與排程執行狀態。
- `reports/`: Markdown 週報。
- `arrange_exports/`: Issue scrape、LLM 結果與 Excel 匯出歷史。

## 打包

```powershell
npm run dist
```

這會依序：

1. 編譯 TypeScript 到 `dist/`
2. 用 PyInstaller 打包後端到 `backend/dist/gitlab-tracker-backend/`
3. 用 `electron-builder` 產出安裝檔到 `release/`

## 文件

- [文件總覽](docs/README.md)
- [產品文件](docs/product/README.md)
- [架構文件](docs/architecture/README.md)
- [操作文件](docs/operations/README.md)
- [API 規格](docs/specs/API_SPEC.md)
