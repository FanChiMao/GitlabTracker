# Architecture

這裡描述 Gitlab Tracker 現在的執行架構、資料落地方式，以及跟重構後程式碼對應的主要模組。

## 文件導覽

| 文件                                       | 內容                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [runtime-overview.md](runtime-overview.md) | Electron、frontend partials、FastAPI 與排程如何一起工作                                  |
| [data-model.md](data-model.md)             | `config.json`、`issues_cache.json`、`meta.json`、`arrange_exports/` 與前端 local storage |
| [decisions/](decisions/)                   | 保留的重要架構決策記錄                                                                   |

## 當前實作重點

- UI 已改成 `frontend/index.html + partials + bootstrap.js + legacy-app.ts` 組合。
- Electron main process 仍負責啟動後端、檔案選擇、開外部連結與 PDF 匯出。
- FastAPI 是所有資料與商業邏輯的中心，包含同步、分析、AI、Issue Arrange 與報表。
- 背景排程是 App 內的 daemon thread，不是獨立服務。
