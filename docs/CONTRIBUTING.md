# Contributing Guide

## 1. 分支策略

- `main`：可發佈版本
- 功能分支：`feat/<short-name>`
- 修錯：`fix/<short-name>`
- 文件：`docs/<short-name>`

## 2. Commit 訊息

採用 Conventional Commits：

```text
feat(backend): add /api/issues/{iid}/links endpoint
fix(renderer): debounce search input to avoid table flicker
docs(api): document new analytics fields
chore(deps): bump electron to 41.2.3
refactor(scheduler): extract should_run logic
```

## 3. Pull Request 流程

1. 從 `main` 開分支
2. 開發 + `npm run format`
3. 自我驗證：
   - `npm run dev` 可成功啟動
   - 變更後端：`http://127.0.0.1:8765/docs` 對應端點可呼叫
   - 變更 UI：截圖附在 PR
4. 同步更新文件：
   - 新 API → [docs/specs/API_SPEC.md](specs/API_SPEC.md)
   - 新使用者操作 → [docs/product/user-flow.md](product/user-flow.md)
   - 重大決策 → 新增 ADR 到 [docs/architecture/decisions/](architecture/decisions/)
5. PR 描述應包含：背景、做了什麼、如何驗證、影響範圍

## 4. 程式碼風格

| 語言 | 工具 | 設定 |
| --- | --- | --- |
| TypeScript | `tsc strict`、Prettier | [tsconfig.json](../tsconfig.json) |
| Python | PEP 8 + 類型註解 + `from __future__ import annotations` | (尚未引入 ruff/black，歡迎 PR) |
| Markdown | Prettier | 80–120 字元寬 |

## 5. 測試（待補）

- 目前 **沒有自動化測試**
- 建議優先補：
  - `core/report_service.build_dashboard` 的 fixture 測試
  - `core/scheduler.TrackerScheduler._should_run` 的時間邊界測試
  - Renderer 主要 reducer / formatter 函式的單元測試

## 6. 給 AI Coding Agent 的規則

1. 修檔前先看 [docs/architecture/runtime-overview.md](architecture/runtime-overview.md)。
2. **不要** 在 Renderer 直接 import Node modules（`contextIsolation` 已切斷）。
3. **不要** 在 Backend 引入新的網路 listener（只能用 FastAPI route）。
4. 新增 dependency：
   - Node：`npm install --save` 並提交 `package-lock.json`
   - Python：加入 `backend/requirements.txt` 並重新 PyInstaller hidden import
5. 修改任何 API → 同步 [API_SPEC.md](specs/API_SPEC.md)。
6. 修改任何 UI 流程 → 同步 [user-flow.md](product/user-flow.md)。
7. 寫商業邏輯一律放 `backend/core/*.py`，`app.py` 保持 thin。
8. 不要在程式碼里塞 token / API key 預設值。
