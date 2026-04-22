# Data Model

說明所有 **持久化檔案** 與 **In-memory dataclass / dict** 的結構。所有檔案皆為 JSON、UTF-8、2-space indent。

## 1. 儲存位置

由 [config_store.py](../../backend/core/config_store.py) `data_dir()` 解析：

| 模式 | 路徑 |
| --- | --- |
| Dev | `backend/data/` |
| Packaged | `%APPDATA%/Gitlab Tracker/tracker-data/`（Win），由 main process 注入 `GITLAB_TRACKER_DATA_DIR` |

底下三個檔案 + 一個資料夾：

```text
data/
├── config.json         # 使用者設定（含 token）
├── issues_cache.json   # 上次同步的完整 GitLab Issue list
├── meta.json           # 同步 / 週報時間戳、scheduler 防重
└── reports/
    └── weekly_report_YYYYMMDD_HHMMSS.md
```

## 2. `config.json`

預設值來自 [`DEFAULT_CONFIG`](../../backend/core/config_store.py)。

```jsonc
{
  "gitlab_url": "http://gitlab.company.local",
  "token": "glpat-...",
  "project_ref": "products/aisvisionplatform/frontend",
  "project_ref_history": ["592", "products/x"],   // 最多 10 筆
  "import_file": "",                               // 若有值代表離線匯入 JSON
  "gemini_api_key": "AIza...",
  "enable_daily_sync": true,
  "daily_sync_time": "09:00",
  "enable_weekly_report": true,
  "weekly_report_time": "17:30"
}
```

## 3. `issues_cache.json`

`fetch_issues()` 直接寫入；元素由 [`GitLabIssueClient._normalize_issue()`](../../backend/core/gitlab_client.py) 產生。**核心欄位**（節錄）：

```jsonc
{
  "id": 12345, "iid": 42, "project_id": 7,
  "title": "[ModuleA] 功能 X",
  "description": "...",
  "state": "opened" | "closed",
  "web_url": "https://.../-/issues/42",
  "labels": ["【Page】Login", "bug"],
  "author":   { "id": 1, "username": "alice", "name": "Alice", "web_url": "..." },
  "assignees":[ { "id": 2, "username": "bob", "name": "Bob", "avatar_url": "...", "web_url": "..." } ],
  "milestone":{ "id": 9, "iid": 1, "title": "Sprint 12", "start_date": "...", "due_date": "..." },
  "created_at": "2026-04-15T08:00:00Z",
  "updated_at": "2026-04-22T05:30:00Z",
  "closed_at":  null,
  "due_date":   "2026-04-30",
  "merge_requests_count": 1,
  "blocking_issues_count": 0,
  "task_completion_status": { "count": 5, "completed_count": 3 },
  "user_notes_count": 4,
  "has_new_discussions": false,    // 由 fetch_issues() 比對前後 user_notes_count 計算
  "raw": { /* 完整原始 GitLab payload，保留以便未來擴充 */ }
}
```

> **`has_new_discussions`** 是 cache 寫入前比對舊 cache 動態計算的旗標；前端據此顯示紅點。

## 4. `meta.json`

```jsonc
{
  "last_sync":  "2026-04-22T05:47:00+00:00",
  "last_report":"2026-04-22T05:47:28+00:00",
  "latest_report_path": "D:\\...\\reports\\weekly_report_20260422_054728.md",
  "scheduler": {
    "daily_sync":   "2026-04-22",
    "weekly_report":"2026-04-18"
  }
}
```

`scheduler.<task>` 存「當日已執行的日期字串」，避免同一分鐘內重複觸發。

## 5. 週報 Markdown

由 [`generate_weekly_markdown()`](../../backend/core/report_service.py) 產生，檔名 `weekly_report_<YYYYMMDD_HHMMSS>.md`，路徑由 `weekly_report_path()` 決定。內容區段：

1. 週摘要 (KPI)
2. 本週新增 Issue
3. 本週重點推進
4. 風險與阻塞
5. 模組分佈

## 6. Dashboard / Analytics 衍生模型

**這些不是儲存檔，而是 API response shape**，定義在 `report_service.build_dashboard()` 與 `app.get_analytics()`：

| Key | 來源 | 說明 |
| --- | --- | --- |
| `summary.weekly_new_count` | `created_at >= now - 7d` | 本週新增 |
| `summary.weekly_updated_count` | `updated_at >= now - 7d` | 本週更新 |
| `summary.weekly_closed_count` | `state == closed && closed_at >= now - 7d` | 本週關閉 |
| `summary.risk_count` | 無負責人 / 7 天內到期 / 14 天未更新 | 風險旗標 |
| `burndown[]` | per milestone day-by-day open vs ideal | 燃盡圖 |
| `workload[]` | per assignee opened/closed/overdue | 工作量熱圖 |
| `lifecycle.mttr_days` | mean(closed_at - created_at) | 平均解決時間 |
| `delivery.followups[]` | 應補 MR / blocked / 任務完成卻無 MR | 跟進建議 |

## 7. Module 萃取規則

[`extract_module()`](../../backend/core/report_service.py)：

1. 若 label 以 `【Page】` 開頭 → 取後段（例：`【Page】Login` → `Login`）
2. 否則若 title 以 `[ModuleX]` 開頭 → 取 `ModuleX`
3. 否則 `None`

> 改變這個規則會影響 Dashboard 的「模組分佈」與週報內的歸類。
