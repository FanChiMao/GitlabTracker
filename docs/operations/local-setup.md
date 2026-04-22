# Local Setup

## 1. 系統需求

- Windows 10/11（主要支援平台；macOS/Linux 路徑邏輯已寫入但未驗證）
- **Node.js 18+**（建議 LTS）
- **Python 3.11+**（已測 3.11–3.13）
- Git

## 2. Clone & 安裝相依

```powershell
git clone <repo-url> GitlabTracker
cd GitlabTracker

# Node 相依
npm install

# Python 虛擬環境（重要：路徑必須是 .venv，main.ts 會優先找 .venv\Scripts\python.exe）
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

> 若 PowerShell 拒絕執行 `Activate.ps1`，先執行 `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`。

## 3. 啟動開發

```powershell
npm run dev
```

實際做了：

1. `tsc -p tsconfig.json` 編譯 `src/` + `renderer/` TS 到 `dist/`
2. `electron .` 啟動 main process
3. main process 自動 spawn `.venv\Scripts\python.exe backend/app.py --port 8765`
4. 待 `/api/health` 200 後開窗

> Renderer DevTools 在 dev mode 預設開啟。

## 4. 只跑後端（API 開發 / 排程驗證）

```powershell
.\.venv\Scripts\Activate.ps1
python backend/app.py --port 8765
# 或一次性任務
python backend/app.py --once fetch
python backend/app.py --once weekly-report
```

可用 `http://127.0.0.1:8765/docs` 看 FastAPI 自動產生的 Swagger UI。

## 5. 設定資料目錄

- Dev：預設 `backend/data/`
- 也可用環境變數覆寫：

```powershell
$env:GITLAB_TRACKER_DATA_DIR = "D:\path\to\custom-data"
python backend/app.py
```

## 6. 編輯器設定

- 推薦 VS Code + Python + ESLint + Prettier 擴充。
- 格式化：`npm run format`
- 檢查：`npm run format:check`
- TS strict mode 已開（見 [tsconfig.json](../../tsconfig.json)）。

## 7. 常用指令速查

| 指令 | 功能 |
| --- | --- |
| `npm run build:ts` | 只編譯 TS |
| `npm run dev` | 編譯 + 啟動 Electron |
| `npm run pack:backend` | 用 PyInstaller 打 backend |
| `npm run pack` | dev pack（不建安裝檔） |
| `npm run dist` | 完整 release（含 NSIS） |
| `npm run format` | Prettier 格式化 |
