# Data Model

這份文件描述目前會落地保存的資料，以及前端本地狀態的保存方式。

## 1. 主要資料目錄

後端所有核心資料都走 `core/config_store.py` 的 `data_dir()`：

- 開發模式：`backend/data/`
- 打包模式：`<Electron userData>/tracker-data/`
- 也可用 `GITLAB_TRACKER_DATA_DIR` 覆寫

目錄結構如下：

```text
data/
├── config.json
├── issues_cache.json
├── meta.json
├── reports/
│   └── weekly_report_YYYYMMDD_HHMMSS.md
└── arrange_exports/
    ├── scrape/
    ├── result/
    └── excel/
```

## 2. `config.json`

`config.json` 由 `/api/config` 讀寫，內容對齊 `DEFAULT_CONFIG`：

```json
{
  "gitlab_url": "http://gitlab.company.local",
  "token": "glpat-***",
  "project_ref": "group/project",
  "project_ref_history": ["group/project", "592"],
  "import_file": "",
  "gemini_api_key": "AIza***",
  "enable_daily_sync": true,
  "daily_sync_time": "09:00",
  "enable_weekly_report": true,
  "weekly_report_time": "17:30"
}
```

補充規則：

- `project_ref_history` 會去重並保留最新 10 筆
- `POST /api/config` 若 `project_ref` 或 `gitlab_url` 變更，會清空既有 cache 與 `last_sync`

## 3. `issues_cache.json`

這是整個 App 最重要的資料來源。同步完成後，dashboard、analytics、timeline、table、chat 都以它為基礎。

常用欄位如下：

```json
{
  "iid": 42,
  "title": "[Backend] Fix report export",
  "state": "opened",
  "labels": ["Stage::Backend", "bug"],
  "assignees": [{ "name": "Alice", "username": "alice" }],
  "milestone": {
    "title": "Sprint 12",
    "start_date": "2026-04-21",
    "due_date": "2026-04-30"
  },
  "created_at": "2026-04-22T05:47:00Z",
  "updated_at": "2026-04-27T10:20:00Z",
  "closed_at": null,
  "due_date": "2026-04-29",
  "web_url": "https://gitlab/.../-/issues/42",
  "issue_type": "issue",
  "merge_requests_count": 1,
  "blocking_issues_count": 0,
  "task_completion_status": {
    "count": 5,
    "completed_count": 3
  },
  "user_notes_count": 4,
  "has_new_discussions": true
}
```

說明：

- `has_new_discussions` 是本次同步與上次快取比較 `user_notes_count` 後補上的欄位
- `module` 不直接存檔，而是由 `report_service.extract_module()` 動態推導
- `simplify_issue()` 會將原始 issue 轉成前端較穩定的 response shape

## 4. `meta.json`

`meta.json` 存的是執行狀態，而不是業務資料：

```json
{
  "last_sync": "2026-04-28T02:00:00+00:00",
  "last_report": "2026-04-28T09:30:00+00:00",
  "latest_report_path": "D:\\...\\reports\\weekly_report_20260428_093000.md",
  "scheduler": {
    "daily_sync": "2026-04-28",
    "weekly_report": "2026-04-26"
  }
}
```

用途：

- Dashboard 顯示最後同步與最新報表
- Scheduler 用 `scheduler.<task>` 防止同一天重複執行

## 5. `reports/`

週報會輸出成：

- `weekly_report_YYYYMMDD_HHMMSS.md`

內容來自 `report_service.generate_weekly_markdown()`，主要包含：

- KPI summary
- 本週新增 Issue
- focus progress
- 風險與阻塞

## 6. `arrange_exports/`

Issue Arrange 的所有輸出都會落在這裡：

- `scrape/`: 從 GitLab discussion 組出來的原始文本
- `result/`: LLM 整理後的結果
- `excel/`: Excel 匯出

命名規則大致為：

```text
<repo>_<iid>_<suffix>_<timestamp>.md
issue_workspace_<timestamp>.xlsx
```

其中：

- `suffix = scrape` 代表原始文本
- `suffix = <model-name>` 代表 LLM 結果

`/api/arrange/history` 與 `/api/arrange/history/{filename}` 會直接讀這些檔案。

## 7. 前端 localStorage

除了後端資料檔外，前端還會在 localStorage 存一些 UI 狀態：

| Key                                       | 內容                                                 |
| ----------------------------------------- | ---------------------------------------------------- |
| `gitlab-tracker:config-cache`             | 最近一次載入的設定快取                               |
| `gitlab-tracker:ui-preferences`           | theme、scale、sidebarWidth、預設模型、arrange prompt |
| `gitlab-tracker:arrange-prompt-templates` | 使用者自訂的 arrange prompt templates                |

這些資料不會寫入後端 `config.json`。

## 8. Electron 端附屬設定

Electron main process 另外會在 `app.getPath('userData')` 下保存：

- `external-link-preferences.json`

它用來記住使用者偏好的外部瀏覽器，例如 Chrome、Edge 或系統預設瀏覽器。
