# Non-Functional Requirements (NFR)

## 1. 效能

| 指標 | 目標 | 量測方式 |
| --- | --- | --- |
| 冷啟動到主視窗可互動 | ≤ 5 秒（含 backend health check） | main.ts 啟動 timestamp |
| Dashboard 首次資料載入 | ≤ 1 秒（cache hit） | `GET /api/dashboard` |
| 同步 1000 筆 Issue | ≤ 30 秒 | `POST /api/fetch` |
| Analytics 計算 | ≤ 500 ms / 1000 筆 | `GET /api/analytics` |
| AI Discussion Summary | ≤ 15 秒（依 Gemini） | `POST /api/issues/{iid}/discussions/summary` |
| AI Chat 回答 | ≤ 20 秒（依 Gemini） | `POST /api/chat` |

## 2. 可用性 / 可靠性

- 排程任務具備「同日去重」（`meta.scheduler.<task>` 紀錄日期）。
- GitLab 呼叫單次 timeout 30s；Gemini 60–90s。
- AI 呼叫對 429 自動 exponential backoff 3 次。
- Backend 崩潰時 main process 會印 `Backend exited with code N`，但目前 **不自動重啟**（v1.0 限制，建議 v1.1 加 supervisor）。

## 3. 相容性

| 項目 | 支援範圍 |
| --- | --- |
| OS | Windows 10/11 x64（macOS/Linux 程式碼預留但未驗證） |
| Node | 18 LTS+ |
| Python | 3.11–3.13 |
| GitLab | self-hosted CE/EE 14+，GitLab.com SaaS |
| Gemini | `gemma-4-31b-it`（預設）、`gemini-2.5-pro/flash`（可在 `LLM_MODELS` 切換） |

## 4. 可維護性

- TypeScript strict、Python typed (`from __future__ import annotations` + PEP 604 union)
- 後端業務邏輯集中於 `core/*`，`app.py` 只做 routing 組合
- 文件位於 `docs/`，新增 API 必同步更新 [API_SPEC.md](../specs/API_SPEC.md)
- 重要技術選型有 ADR ([architecture/decisions/](../architecture/decisions/))

## 5. 可觀測性

- Backend：所有 print 走 stdout/stderr，由 main process 轉到 Electron console
- Renderer：DevTools 自動開（dev mode）
- 目前 **無結構化 log / metrics 系統**（v2 候選：加 logging + 寫檔）

## 6. 國際化

- v1.0 僅繁體中文 UI 與 Prompt
- 後端錯誤訊息包含中文，會直接顯示給使用者

## 7. 容量假設

| 項目 | 上限假設 |
| --- | --- |
| 單一 project 的 Issue | 5,000 筆內穩定 |
| `issues_cache.json` 檔案大小 | < 50 MB |
| 週報歷史檔 | 不自動清理；建議手動歸檔 |
| `project_ref_history` | 10 筆 |

## 8. 升級 / 相容性

- `config.json` 使用 `DEFAULT_CONFIG.update(loaded)` 合併，新增欄位向下相容。
- `issues_cache.json` 結構若改 schema，請在 `_normalize_issue()` 加版本欄位（目前無 schema version）。
