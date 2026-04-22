# Troubleshooting

## 啟動

| 症狀 | 可能原因 | 處理 |
| --- | --- | --- |
| 主視窗一直顯示「Backend not ready」 | 8765 port 被占用 | 用 `netstat -ano \| findstr 8765` 找出占用 process，殺掉或改 `BACKEND_PORT` |
| `Backend exited with code 1` | venv 沒裝 fastapi/uvicorn | `pip install -r backend/requirements.txt` |
| Packaged 版本啟動秒退 | PyInstaller 缺 hidden import | 開 `release/win-unpacked/...exe` 用 cmd 跑看 stderr |
| `did-fail-load` | renderer 路徑錯誤 | 確認 `tsc` 有編譯到 `dist/`，重跑 `npm run build:ts` |

## 同步 / GitLab

| 症狀 | 處理 |
| --- | --- |
| 401 Unauthorized | Token 失效或缺 `read_api` scope |
| 404 Project Not Found | `project_ref` 必須是 path（含 group）或數字 id |
| SSL 錯誤 | 後端預設 `verify_ssl=False`；若要驗證憑證請改 [`gitlab_client.py`](../../backend/core/gitlab_client.py) |
| Issue 數量很多時長時間 hang | GitLab 分頁 100 / page，可調整或加 progress callback（v1 未實作） |

## AI

| 症狀 | 處理 |
| --- | --- |
| `請先在設定中填入 Gemini API Key` | 在側欄填入並儲存 |
| `Gemini API 錯誤：429` | rate limit，後端已自動退避 3 次；稍後重試 |
| 摘要回傳「Empty model response」 | 換 `LLM_MODELS` 列表中的另一個 model |

## 排程

| 症狀 | 處理 |
| --- | --- |
| 設定的時間到了沒跑 | 確認 App 是開著的；scheduler 是 in-process thread |
| 重複跑兩次 | 檢查 `meta.json` 的 `scheduler.<task>` 是否被外部清空 |
| 想關掉 App 也能跑 | 用 OS Task Scheduler 呼叫 `python backend/app.py --once fetch` |

## 資料

| 症狀 | 處理 |
| --- | --- |
| 想重置全部設定 | 刪除 `data_dir()` 整個資料夾（dev: `backend/data`；packaged: `%APPDATA%/Gitlab Tracker/tracker-data`） |
| Token 看起來儲存有問題 | `config.json` 是明碼存放，未加密；參考 [SERCURITY.md](../sercurity/SERCURITY.md) |
| 換了 project 結果還看到舊資料 | 後端已在 `POST /api/config` 偵測到變更時清 cache，若沒生效可手動刪 `issues_cache.json` |

## PDF 匯出

| 症狀 | 處理 |
| --- | --- |
| PDF 是空白的 | 檢查 `GET /api/report/html` 是否有資料；先按「立即產生週報」 |
| 中文亂碼 | Electron 自帶 Chromium 通常 OK，若仍失敗請確認系統字型 |
