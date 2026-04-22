# ADR 0001 — Electron 前端 + Python FastAPI 後端的雙語架構

- **狀態**：Accepted
- **日期**：2025
- **決策者**：原始作者

## Context

Gitlab Tracker 同時需要：

1. **桌面 UI**：跨平台、能存取本機檔案、能呼叫系統瀏覽器、能匯出 PDF。
2. **大量 GitLab REST 呼叫 + 資料聚合 + LLM 整合**：仰賴 Python 生態（`requests`, `pydantic`, `pyinstaller` 等）。

純 Node.js 雖可，但 Python 對 PM/資料分析腳本更友善，且未來想加 pandas / numpy / openpyxl 也較順。

## Decision

採用 **Electron (TS) + Python FastAPI** 雙 process 架構：

- Electron main process 負責視窗、IPC、PDF 匯出、外部瀏覽器選擇。
- Python FastAPI 處理所有業務邏輯，listen `127.0.0.1:8765`。
- 前端透過 fetch 走 HTTP，**不使用 Electron IPC 傳業務資料**（IPC 只用於 file dialog / shell.openPath / printToPDF）。

## Consequences

**優點**

- 後端可獨立執行 (`python backend/app.py --once fetch`)，方便排程與測試。
- 前端與後端介面就是一份 OpenAPI / [`API_SPEC.md`](../../specs/API_SPEC.md)，AI Agent 容易自動補完。
- 後端可單獨被替換成 Web 服務版本，不需要動 UI。

**代價**

- 啟動需等 backend 就緒（`waitForBackendReady`），多一段冷啟時間。
- 打包要兩套：`tsc` + `pyinstaller`，由 `npm run dist` 串起來。
- 8765 port 衝突需處理（目前未實作自動 fallback）。

## Alternatives Considered

- **純 Node.js**：放棄 Python 生態。
- **PyWebView / Tauri**：減少 binary 大小，但目前團隊熟悉 Electron 較多。
- **Embedded Python via PythonNet / Pyodide**：複雜度高、打包風險大。
