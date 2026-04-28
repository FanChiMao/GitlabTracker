# Local Setup

## 1. 需求

- Windows 10/11
- Node.js 18+
- Python 3.11+
- Git

目前專案以 Windows 開發流程為主，因為 Electron 打包與本地路徑處理都先針對 Windows 驗證。

## 2. 安裝相依

```powershell
git clone <repo-url> GitlabTracker
cd GitlabTracker

npm install

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

如果 PowerShell 擋住啟用虛擬環境，可先執行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

## 3. 啟動開發模式

```powershell
npm run dev
```

這個指令會做三件事：

1. `tsc -p tsconfig.json`
2. 啟動 Electron
3. 由 Electron 自動 spawn `backend/app.py --port 8765`

啟動成功後：

- 後端 API 在 `http://127.0.0.1:8765`
- UI 會以本地 HTML partials 載入

## 4. 單獨啟動後端

如果你只想測 API：

```powershell
.\.venv\Scripts\Activate.ps1
python backend\app.py --port 8765
```

常用附加指令：

```powershell
python backend\app.py --once fetch
python backend\app.py --once weekly-report
```

Swagger UI：

```text
http://127.0.0.1:8765/docs
```

## 5. 資料目錄

開發模式預設資料目錄是：

```text
backend/data/
```

你也可以用環境變數覆寫：

```powershell
$env:GITLAB_TRACKER_DATA_DIR = "D:\path\to\tracker-data"
python backend\app.py
```

## 6. 常用 scripts

| 指令                   | 用途                                                 |
| ---------------------- | ---------------------------------------------------- |
| `npm run build:ts`     | 編譯 `src/**/*.ts` 與 `frontend/**/*.ts` 到 `dist/`  |
| `npm run dev`          | 編譯並啟動 Electron                                  |
| `npm run pack:backend` | 用 PyInstaller 打包後端                              |
| `npm run pack`         | 產生 unpacked Electron 內容                          |
| `npm run dist`         | 產生正式 release 安裝檔                              |
| `npm run format`       | 格式化 md / json / ts / html / css 與 backend Python |
| `npm run format:check` | 格式檢查                                             |

## 7. 首次驗證清單

1. 在 `Connections` 頁面填入 GitLab 與 Gemini 設定
2. 點 `Sync Now`
3. 確認 `Dashboard` 有資料
4. 確認 `Issue Arrange` 能 preview 一筆 Issue URL
5. 確認能打開 `AI Chat` 或產生 `AI 摘要`
