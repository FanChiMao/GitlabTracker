# Glossary

| 術語 | 定義 |
| --- | --- |
| **Issue** | GitLab Issue。原始物件由 GitLab REST 回傳，正規化後存入 `issues_cache.json` |
| **IID** | Issue Internal ID，project 內遞增（`#42`），與全域 `id` 不同 |
| **Project Ref** | GitLab project 的識別字串，可以是 `group/subgroup/project` 或數字 `id` |
| **Module** | 從 label `【Page】XXX` 或 title `[XXX]` 萃取出的子模組名稱，用於分類 |
| **Dashboard** | 主畫面，顯示一週概況與重要 Issue |
| **Analytics** | 第二個 Tab，包含 Burndown、Workload、Lifecycle、Delivery 等視圖 |
| **Burndown** | 按 milestone 計算的剩餘 Issue 數隨時間變化的曲線（含理想線） |
| **Workload** | 每位 assignee 的 opened / closed / overdue 統計 |
| **MTTR** | Mean Time To Resolve，平均 Issue 從 created 到 closed 的天數 |
| **Followup** | 系統建議要追蹤的 open issue（無 MR 但快到期、被 block、checklist 完成卻無 MR 等） |
| **Risk** | Dashboard 中標示的高風險 Issue：無負責人、7 天內到期、或 14 天未更新 |
| **Discussion** | GitLab Issue 下的留言串（多個 notes 組成一個 discussion thread） |
| **Cache** | `issues_cache.json`，最近一次 `fetch` 的快照；UI 大部分查詢都讀它 |
| **Scheduler** | 後端 daemon thread，每 30 秒檢查是否到了「每日同步」或「週五週報」時間 |
| **Weekly Report** | 自動或手動產出的 Markdown 週報，存於 `data/reports/` |
| **Tracker Bridge** | preload 透過 `contextBridge` 暴露給 renderer 的 IPC API（`window.trackerBridge`）|
