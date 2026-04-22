# Architecture

本資料夾說明 Gitlab Tracker 的 **系統架構**、**執行期行為**、**資料模型** 與 **設計決策（ADR）**。

## 文件清單

| 文件 | 說明 |
| --- | --- |
| [runtime-overview.md](runtime-overview.md) | Electron + FastAPI 啟動流程、Process 結構、模組依賴關係、執行緒模型 |
| [data-model.md](data-model.md) | 持久化檔案 (`config.json` / `issues_cache.json` / `meta.json`) 與 GitLab Issue 內部資料模型 |
| [decisions/](decisions/) | Architecture Decision Records (ADR)：記錄重要技術選型 |

## 高階圖示

```text
┌─────────────────────────────────────────────────────────────┐
│                   Electron Main Process                      │
│  src/main.ts                                                 │
│   ├─ spawn()  ──► Python FastAPI (uvicorn @ :8765)          │
│   ├─ BrowserWindow ──► loadFile(renderer/index.html)        │
│   └─ ipcMain ◄────── preload (contextBridge)                │
└─────────────────────────────────────────────────────────────┘
              │ HTTP (127.0.0.1:8765)
              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Python FastAPI Backend                      │
│  backend/app.py                                              │
│   ├─ /api/*  REST endpoints                                  │
│   ├─ TrackerScheduler (daemon thread, 30s tick)             │
│   └─ core/                                                   │
│        ├─ gitlab_client.py  ──► GitLab REST API (v4)        │
│        ├─ report_service.py ──► Markdown / HTML 週報         │
│        ├─ config_store.py   ──► JSON 持久化                  │
│        └─ scheduler.py      ──► 每日同步 / 週五週報         │
└─────────────────────────────────────────────────────────────┘
              │                          │
              ▼                          ▼
        GitLab REST API           Google Gemini API
        (private token)           (用於 LLM 摘要 / Chat)
```

## 主要技術選型

- **Electron 41** — 跨平台桌面殼層
- **TypeScript 5** — Electron main / preload / renderer 都使用 TS，編譯到 `dist/`
- **FastAPI + Uvicorn** — 輕量 ASGI；以 single-worker、loopback (127.0.0.1) 啟動
- **Pydantic v2** — Request payload validation
- **PyInstaller** — 把後端打成單一可執行檔，再由 electron-builder 透過 `extraResources` 包進去
- **electron-builder (NSIS)** — Windows 安裝檔
- **Vanilla HTML/CSS/TS（無框架）** — Renderer 直接操作 DOM，避免引入 React/Vue 增加複雜度

詳細決策原因請看 [decisions/](decisions/)。
