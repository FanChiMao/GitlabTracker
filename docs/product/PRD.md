# Gitlab Tracker — Product Requirements Document (PRD)

## 1. 問題與動機

中小型團隊使用 self-hosted GitLab 管理 Issue，但：

- PM 每週要手動爬 Issue、整理週報，平均 2–3 小時。
- 「逾期」「無人領」「卡關」等風險靠人工檢查容易遺漏。
- Issue 對話又長又散，新加入的 stakeholder 抓不到重點。

## 2. 目標使用者 (Persona)

| Persona | 痛點 | 期待 |
| --- | --- | --- |
| **Project Manager (Amy)** | 每週寫週報耗時、需要彙整跨模組進度 | 一鍵產生週報、看到風險清單 |
| **Tech Lead (Ben)** | 需要分配工作、評估 milestone 完成率 | Burndown、Workload heatmap、MTTR |
| **Engineer (Cathy)** | 想快速看到指派給自己的 Issue 與最新討論 | Issue 總表、討論摘要、近期更新清單 |

## 3. 範圍

### In-scope (v1.0)

- 連線到 self-hosted / SaaS GitLab（透過 Personal Access Token，`read_api` scope）。
- Issue / Discussions / Related MRs / Issue Links 拉取與快取。
- Dashboard：本週新增 / 更新 / 關閉 / 風險 / 近期更新（可調時數視窗）。
- Analytics：Burndown per milestone、Workload per assignee、Label 分佈、Lifecycle (MTTR/median/p90)、Delivery follow-ups。
- Timeline：Milestone 與 Issue 時程視圖。
- Issue Table：含篩選 / 排序 / 抽屜詳情（含 MR、Linked Issues、Discussions）。
- 排程：每日同步 + 每週五自動週報。
- 週報：Markdown 檔案 + 可線上預覽 HTML + 匯出 PDF。
- AI：Issue 討論摘要（單筆）+ 對全部 Issue 的問答 Chat（皆透過 Gemini API）。
- 離線匯入：可從既有 `gitlab_issues_full.json` 載入。

### Out-of-scope (v1.0)

- 多專案同時追蹤（一次只追一個 project_ref）。
- 修改 GitLab Issue（純讀取）。
- 多人協作 / 帳號系統（純單機 App）。
- Web / Mobile 版本。
- 自訂報表模板（v1.0 為固定格式）。

## 4. Feature List

| ID | Feature | Priority |
| --- | --- | --- |
| F-1 | GitLab 連線設定（URL / Token / Project Ref） | P0 |
| F-2 | Issue 同步（手動 / 每日定時） | P0 |
| F-3 | Dashboard 主視圖 | P0 |
| F-4 | 週報自動產生（每週五） | P0 |
| F-5 | 週報手動產生 + Markdown 匯出 | P0 |
| F-6 | 週報 HTML 預覽 + PDF 匯出 | P1 |
| F-7 | Analytics 分頁（Burndown / Workload / Lifecycle） | P1 |
| F-8 | Issue 抽屜（含 MR / Linked / Discussions） | P1 |
| F-9 | AI Discussion Summary | P2 |
| F-10 | AI Chat over Issues | P2 |
| F-11 | 外部連結瀏覽器選擇（Chrome / Edge / 預設） | P2 |
| F-12 | 視窗縮放（Ctrl + +/−/0） | P3 |

## 5. 成功指標 (KPI)

- **採用率**：3 個月內團隊內 ≥ 80% PM/TL 安裝。
- **效率**：每週週報製作時間從 2–3 小時 → ≤ 15 分鐘。
- **覆蓋**：Issue 同步成功率 ≥ 99%（per week）。
- **準確度**：AI 問答的 Issue 引用 IID 正確率 ≥ 95%（人工抽樣）。

## 6. 假設與限制

- 使用者所在網路可直接連到 GitLab Server（無強制 proxy 設定 UI）。
- 後端 SSL 預設 `verify=False`（公司內網 self-signed）。若要對外環境上線需評估。
- LLM 呼叫需額外申請 Gemini API Key，並接受資料外送至 Google。
