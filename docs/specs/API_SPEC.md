# API Spec — Gitlab Tracker Backend

- **Base URL**：`http://127.0.0.1:8765`（loopback only）
- **OpenAPI**：`http://127.0.0.1:8765/docs`（FastAPI 自動）
- **Auth**：無（loopback、單機 App；不要將 port 暴露到外網）
- **Content-Type**：`application/json`
- **錯誤格式**：FastAPI 預設 `{"detail": "..."}`

> 修改 / 新增 API 請務必同步更新本檔。

## 1. Health

### `GET /api/health`

回傳 `{"status": "ok"}`，main process 啟動時用來 polling。

---

## 2. Config

### `GET /api/config`

回傳目前設定（含 token，請小心紀錄到 log）。Schema：

```ts
type AppConfig = {
  gitlab_url: string;
  token: string;
  project_ref: string;
  project_ref_history: string[];
  import_file: string;
  gemini_api_key: string;
  enable_daily_sync: boolean;
  daily_sync_time: string;       // "HH:MM" 24h
  enable_weekly_report: boolean;
  weekly_report_time: string;    // "HH:MM"
};
```

### `POST /api/config`

Body 同上 (`ConfigPayload`)。**Side effect**：

- 寫入 `config.json`
- 若 `project_ref` 或 `gitlab_url` 改變 → 清空 `issues_cache.json` 與 `meta.last_sync`
- 將舊 `project_ref` 推入 `project_ref_history`，最多 10 筆

回傳：合併過 default + history 的最新 config。

---

## 3. Sync / Issues

### `POST /api/fetch`

從 GitLab 拉所有 Issues（或讀 `import_file`）→ 比對 `user_notes_count` 標記 `has_new_discussions` → 寫 cache。

回傳：`{"count": <int>}`

錯誤：缺設定 → 400；GitLab 4xx/5xx → 透傳 status / detail。

### `GET /api/dashboard`

回傳 `build_dashboard()` 結果 + meta：

```ts
{
  summary: {
    weekly_new_count: number,
    weekly_updated_count: number,
    weekly_closed_count: number,
    open_issue_count: number,
    unassigned_count: number,
    risk_count: number,
    near_due_count: number,
    by_module: Record<string, number>
  },
  weekly_new: SimplifiedIssue[],
  focus_progress: SimplifiedIssue[],
  risks: SimplifiedIssue[],
  last_sync: string | null,
  last_report: string | null,
  issue_count: number,
  latest_report_path: string | null
}
```

`SimplifiedIssue` 定義在 [`report_service.simplify_issue`](../../backend/core/report_service.py)。

### `GET /api/issues`

回傳 `SimplifiedIssue[]`（全量、扁平化）。

### `GET /api/issues/{iid}/discussions`

從 GitLab 即時抓某 Issue 所有討論。回傳：

```ts
[
  {
    id: string,
    notes: [
      {
        id, body, author_name, author_username,
        author_avatar_url, created_at, updated_at
      }
    ]
  }
]
```

### `GET /api/issues/{iid}/merge-requests`

關聯 MR 列表。`import_file` 模式回 `[]`。

### `GET /api/issues/{iid}/links`

關聯 Issue 連結列表（含 direction、link_type、被連結 issue 摘要）。

---

## 4. AI

### `POST /api/issues/{iid}/discussions/summary`

抓 discussions → 組 prompt → 呼叫 Gemini → 回傳 `{"summary": "..."}`。

需 `gemini_api_key` 已設定，否則 400。Gemini 失敗會 502 並包含 `detail`。

### `POST /api/chat`

Body：

```ts
{
  question: string,
  history: Array<{ role: "user" | "model", content: string }>
}
```

歷史只取最後 10 筆。回傳：

```ts
{ "answer": string, "model": string }
```

> Gemini 透過 `responseSchema` 強制 JSON 結構；若仍失敗會 fallback 文字解析。

---

## 5. Analytics

### `GET /api/analytics`

回傳：

```ts
{
  burndown: Array<{
    milestone, start_date, due_date, total, open, closed,
    series: Array<{ date, open, total, closed, ideal }>
  }>,
  workload: Array<{
    assignee, avatar_url, total, opened, closed, overdue, due_soon
  }>,
  alerts: Array<SimplifiedIssue & {
    severity: "overdue" | "critical" | "warning",
    days_until_due: number
  }>,                                  // 最多 30 筆
  delivery: {
    open_total, linked_mr_count, without_mr_count,
    checklist_count, checklist_done_count,
    blocked_count, stale_without_mr_count,
    followups: SimplifiedIssue[]       // 最多 8 筆
  },
  label_distribution: Array<{ label, total, open }>,
  lifecycle: {
    mttr_days, median_days, p90_days, total_closed,
    histogram: Array<{ bucket, count }>,
    throughput: Array<{ month, count }>
  }
}
```

---

## 6. Reports

### `POST /api/report/weekly`

立即產生週報（Markdown），回傳 `{"report_path": "<abs path>"}`。

### `GET /api/report/html`

回傳 `{"html": "...", "generated_at": "..."}`，供 PDF 匯出使用（純 inline CSS、A4）。

### `GET /api/reports/latest`

回傳 `meta.latest_report_path` 對應的檔案內容：

```ts
{ report_path: string | null, content: string | null }
```

---

## 7. 錯誤碼慣例

| Status | 意義 |
| --- | --- |
| 400 | 缺設定 / 參數錯誤（含 LLM key） |
| 404 | Issue link / MR 不存在（已轉成 `[]`，不會回 404） |
| 502 | 上游（GitLab / Gemini）失敗 |

## 8. CORS

`allow_origins=['*']`、`allow_methods=['*']`，因為只 listen loopback 所以可接受。**不要 bind 到 0.0.0.0**。
