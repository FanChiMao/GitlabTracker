# Troubleshooting

## 啟動問題

| 症狀                         | 可能原因                                     | 建議處理                                                         |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| App 卡在 backend not ready   | 8765 port 被占用，或 Python / exe 沒成功啟動 | 檢查 `netstat -ano                                               | findstr 8765`，再確認 `.venv` 與 Python 安裝 |
| `Backend exited with code 1` | 缺 backend 依賴                              | 重新執行 `python -m pip install -r backend\requirements.txt`     |
| 打包版打不開                 | PyInstaller 輸出缺檔或 hidden import 問題    | 先測 `backend/dist/gitlab-tracker-backend/...exe` 是否能單獨啟動 |
| UI 載入失敗                  | TypeScript 尚未編譯到 `dist/`                | 執行 `npm run build:ts`                                          |

## GitLab 同步

| 症狀                                  | 可能原因                                        | 建議處理                                                          |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| 401 Unauthorized                      | Token 沒有 `read_api`                           | 重新產生 PAT，至少給 `read_api`                                   |
| 404 Project Not Found                 | `project_ref` 寫錯                              | 用完整 group/project path 或正確 project ID                       |
| SSL 連線問題                          | 內網自簽憑證                                    | 目前 client 以 `verify_ssl=False` 連線，若仍失敗請檢查 URL 與網路 |
| 匯入 JSON 後看不到 MR / linked issues | `import_file` 模式不會另外打 GitLab 查 MR/links | 改用 GitLab API 同步，或接受 detail 僅能顯示快取資料              |

## AI / Gemini

| 症狀                   | 可能原因                                  | 建議處理                                  |
| ---------------------- | ----------------------------------------- | ----------------------------------------- |
| 要求填 Gemini API Key  | `config.json` 尚未設定 `gemini_api_key`   | 到 `Connections` 補上後儲存               |
| AI 回答失敗或 502      | Gemini API error、rate limit 或模型不可用 | 重新嘗試，或在 `Preferences` 調整模型順序 |
| Chat 說尚無 Issue 資料 | 還沒同步 `issues_cache.json`              | 先按 `Sync Now`                           |

## Issue Arrange

| 症狀                         | 可能原因                                  | 建議處理                                                         |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Preview 提示 URL 不合法      | 貼到的不是 GitLab issue URL               | 確認 URL 形式為 `.../-/issues/<iid>` 或 `.../-/work_items/<iid>` |
| Filter URL 無法展開          | 不是 GitLab issue filter 頁               | 確認 URL 包含 `/-/issues?`                                       |
| LLM 結果有了，但看不到歷史檔 | `arrange_exports/` 路徑被改掉或檔名不合法 | 先看 `/api/arrange/history` 是否有列出檔案                       |
| Excel 匯出失敗               | 缺 `openpyxl`                             | 重新安裝 backend requirements                                    |

## 報表與 PDF

| 症狀                                  | 可能原因                                        | 建議處理                                        |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Markdown 週報沒有更新                 | 尚未重新生成                                    | 呼叫 `POST /api/report/weekly` 或從 UI 重新產生 |
| PDF 匯出沒反應                        | Electron save dialog 被取消，或 HTML 尚未準備好 | 再試一次，確認 `GET /api/report/html` 有回內容  |
| `latest_report_path` 有值但讀不到內容 | 原始檔已被移除                                  | 重新產生週報                                    |

## 排程與資料路徑

| 症狀                       | 可能原因                         | 建議處理                                                        |
| -------------------------- | -------------------------------- | --------------------------------------------------------------- |
| 設了 daily sync 但沒自動跑 | App 沒開著                       | 這是 app 內排程，不是背景服務                                   |
| 同一天沒有重複執行         | `meta.json.scheduler` 已記錄完成 | 屬於正常保護機制                                                |
| 找不到資料檔               | 不確定目前使用哪個 data dir      | 開發模式看 `backend/data/`；打包模式看 `userData/tracker-data/` |
