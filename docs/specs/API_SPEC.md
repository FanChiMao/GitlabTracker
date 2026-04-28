# API Spec

Gitlab Tracker 後端是本機 FastAPI 服務，預設只綁定 loopback。

## 基本資訊

- Base URL: `http://127.0.0.1:8765`
- Swagger UI: `http://127.0.0.1:8765/docs`
- Content-Type: `application/json`
- 失敗格式：FastAPI 預設 `{"detail": "..."}`

## 1. Health / Config

### `GET /api/health`

回傳：

```json
{ "status": "ok" }
```

Electron main process 會用這個 endpoint 判斷後端是否就緒。

### `GET /api/config`

回傳目前設定：

```json
{
  "gitlab_url": "",
  "token": "",
  "project_ref": "",
  "project_ref_history": [],
  "import_file": "",
  "gemini_api_key": "",
  "enable_daily_sync": true,
  "daily_sync_time": "09:00",
  "enable_weekly_report": true,
  "weekly_report_time": "17:30"
}
```

### `POST /api/config`

Request：

```json
{
  "gitlab_url": "http://gitlab.company.local",
  "token": "glpat-***",
  "project_ref": "group/project",
  "project_ref_history": [],
  "import_file": "",
  "gemini_api_key": "AIza***",
  "enable_daily_sync": true,
  "daily_sync_time": "09:00",
  "enable_weekly_report": true,
  "weekly_report_time": "17:30"
}
```

副作用：

- 寫入 `config.json`
- 若 `gitlab_url` 或 `project_ref` 改變，清空 `issues_cache.json`
- 重置 `meta.last_sync`
- 自動維護 `project_ref_history`

## 2. Sync / Dashboard / Issues

### `POST /api/fetch`

從 GitLab 或匯入 JSON 更新快取。

回傳：

```json
{ "count": 123 }
```

### `GET /api/dashboard`

回傳 dashboard 摘要與列表資料：

```json
{
  "summary": {
    "weekly_new_count": 0,
    "weekly_updated_count": 0,
    "weekly_closed_count": 0,
    "open_issue_count": 0,
    "unassigned_count": 0,
    "risk_count": 0,
    "near_due_count": 0,
    "top_modules": [["Backend", 5]]
  },
  "weekly_new": [],
  "focus_progress": [],
  "risks": [],
  "last_sync": null,
  "last_report": null,
  "issue_count": 0,
  "latest_report_path": null
}
```

### `GET /api/issues`

回傳 `SimplifiedIssue[]`，用於 table、timeline、detail、chat 等畫面。

主要欄位：

```json
{
  "iid": 42,
  "title": "Fix report export",
  "state": "opened",
  "module": "Backend",
  "labels": ["bug"],
  "assignees": ["Alice"],
  "assignee_details": [{ "name": "Alice", "username": "alice", "avatar_url": null }],
  "milestone": "Sprint 12",
  "milestone_start_date": "2026-04-21",
  "milestone_due_date": "2026-04-30",
  "created_at": "2026-04-22T05:47:00Z",
  "updated_at": "2026-04-27T10:20:00Z",
  "closed_at": null,
  "due_date": "2026-04-29",
  "web_url": "https://gitlab/.../-/issues/42",
  "issue_type": "issue",
  "merge_requests_count": 1,
  "blocking_issues_count": 0,
  "task_total": 5,
  "task_completed": 3,
  "user_notes_count": 4,
  "has_new_discussions": true,
  "note": null,
  "reason": null
}
```

### `POST /api/issues/detail-by-url`

Request：

```json
{ "url": "https://gitlab/.../-/issues/42" }
```

回傳：

```json
{
  "issue": {},
  "discussions": [],
  "merge_requests": [],
  "links": [],
  "project_ref": "group/project",
  "source_url": "https://gitlab/.../-/issues/42"
}
```

### `GET /api/issues/{iid}/discussions`

回傳 GitLab discussions 原始資料陣列。

### `GET /api/issues/{iid}/merge-requests`

回傳 related merge requests。若目前資料來源是 `import_file`，直接回傳空陣列。

### `GET /api/issues/{iid}/links`

回傳 linked issues。若目前資料來源是 `import_file`，直接回傳空陣列。

## 3. Issue Arrange

### `POST /api/arrange/preview`

Request：

```json
{
  "urls": ["https://gitlab/.../-/issues/42", "https://gitlab/.../-/issues/43"]
}
```

回傳：

```json
{
  "count": 2,
  "issues": [
    {
      "iid": 42,
      "title": "Fix report export",
      "web_url": "https://gitlab/.../-/issues/42",
      "state": "opened",
      "assignees": ["Alice"],
      "milestone": { "title": "Sprint 12", "due_date": "2026-04-30" },
      "labels": ["bug"]
    }
  ],
  "errors": []
}
```

### `POST /api/arrange/resolve-filter`

Request：

```json
{
  "filter_url": "https://gitlab/group/project/-/issues?state=opened&label_name[]=bug"
}
```

回傳：

```json
{
  "count": 10,
  "project_ref": "group/project",
  "issues": []
}
```

### `POST /api/arrange/process`

先 scrape，再呼叫 LLM。

Request：

```json
{
  "url": "https://gitlab/.../-/issues/42",
  "system_prompt": "請整理成中文摘要",
  "preferred_model": "gemma-4-31b-it",
  "model_candidates": ["gemma-4-31b-it", "gemini-2.0-flash"]
}
```

回傳：

```json
{
  "issue": {},
  "raw_text": "# #42 ...",
  "result": "## 問題摘要 ...",
  "model": "gemma-4-31b-it",
  "saved_raw_path": "D:\\...\\arrange_exports\\scrape\\repo_42_scrape_20260428_101500.md",
  "saved_result_path": "D:\\...\\arrange_exports\\result\\repo_42_gemma-4-31b-it_20260428_101501.md"
}
```

### `POST /api/arrange/scrape`

只產生 raw issue text。

### `POST /api/arrange/llm`

只跑 LLM，不重新抓 GitLab。

Request：

```json
{
  "url": "https://gitlab/.../-/issues/42",
  "raw_text": "# #42 ...",
  "system_prompt": "請整理成中文摘要",
  "preferred_model": "gemma-4-31b-it",
  "model_candidates": ["gemma-4-31b-it", "gemini-2.0-flash"]
}
```

回傳：

```json
{
  "result": "## 問題摘要 ...",
  "model": "gemma-4-31b-it",
  "saved_result_path": "D:\\...\\arrange_exports\\result\\repo_42_gemma-4-31b-it_20260428_101501.md"
}
```

### `POST /api/arrange/export-excel`

Request：

```json
{
  "urls": ["https://gitlab/.../-/issues/42", "https://gitlab/.../-/issues/43"]
}
```

回傳：

```json
{
  "path": "D:\\...\\arrange_exports\\excel\\issue_workspace_20260428_101520.xlsx",
  "count": 2,
  "errors": []
}
```

### `GET /api/arrange/history`

回傳歷史輸出索引：

```json
{
  "root_path": "D:\\...\\arrange_exports",
  "files": [
    {
      "filename": "repo_42_scrape_20260428_101500.md",
      "kind": "scrape",
      "size": 1234,
      "mtime": "2026-04-28 10:15:00",
      "path": "D:\\..."
    }
  ]
}
```

### `GET /api/arrange/history/{filename}`

非 Excel 檔會回傳 `content`，Excel 只回傳路徑與類型。

## 4. AI

### `POST /api/issues/{iid}/discussions/summary`

根據某張 Issue 的 discussions 產生摘要。

回傳：

```json
{ "summary": "..." }
```

需求：

- `gemini_api_key`
- 已設定 GitLab 連線

### `POST /api/chat`

Request：

```json
{
  "question": "這週最危險的是哪些 issue？",
  "history": [
    { "role": "user", "content": "先看 backend" },
    { "role": "assistant", "content": "..." }
  ],
  "preferred_model": "gemma-4-31b-it",
  "model_candidates": ["gemma-4-31b-it", "gemini-2.0-flash"]
}
```

回傳：

```json
{
  "answer": "目前最危險的是 #42、#81 ...",
  "model": "gemma-4-31b-it"
}
```

聊天上下文來自：

- `issues_cache.json`
- 最多最近 10 筆對話歷史

## 5. Analytics

### `GET /api/analytics`

回傳：

```json
{
  "burndown": [],
  "workload": [],
  "alerts": [],
  "delivery": {
    "open_total": 0,
    "linked_mr_count": 0,
    "without_mr_count": 0,
    "checklist_count": 0,
    "checklist_done_count": 0,
    "blocked_count": 0,
    "stale_without_mr_count": 0,
    "followups": []
  },
  "label_distribution": [],
  "lifecycle": {
    "mttr_days": null,
    "median_days": null,
    "p90_days": null,
    "total_closed": 0,
    "histogram": [],
    "throughput": []
  }
}
```

主要用途：

- Burndown chart
- Assignee workload
- 逾期與風險 alerts
- 交付追蹤
- Label 分布
- Issue 生命週期分析

## 6. Reports

### `POST /api/report/weekly`

產生 Markdown 週報：

```json
{ "report_path": "D:\\...\\reports\\weekly_report_20260428_093000.md" }
```

### `GET /api/report/html`

回傳已排版好的 HTML，可交給 Electron 匯出 PDF：

```json
{
  "html": "<!DOCTYPE html>...",
  "generated_at": "2026-04-28 17:30:00"
}
```

### `GET /api/reports/latest`

回傳最後一份 Markdown 報表路徑與內容：

```json
{
  "report_path": "D:\\...\\reports\\weekly_report_20260428_093000.md",
  "content": "# Gitlab Tracker 週報 ..."
}
```

## 7. 常見錯誤碼

| Status | 情境                                                    |
| ------ | ------------------------------------------------------- |
| 400    | 缺必要欄位、缺 Gemini API Key、尚未同步資料、URL 不合法 |
| 404    | arrange 歷史檔不存在                                    |
| 502    | GitLab 或 Gemini 轉接失敗                               |
