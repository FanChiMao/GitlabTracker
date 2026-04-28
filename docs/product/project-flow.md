# Project Flow

這份文件描述 Gitlab Tracker 目前的端到端工作流，從專案接線、同步資料，到 Issue 整理與報表輸出。

## 1. 建立資料來源

使用者在 `Connections` 頁面設定：

- `GitLab Base URL`
- `Private Token`
- `Project Path / ID`
- 可選的 `Gemini API Key`
- 可選的 `Import JSON`

如果有 `Import JSON`，同步時會優先讀取檔案；否則就直接打 GitLab API。

## 2. 同步與快取

按下 `Sync Now` 後：

1. 前端呼叫 `POST /api/fetch`
2. 後端抓取 GitLab issue list，或載入匯入 JSON
3. 將結果寫入 `issues_cache.json`
4. 比對前一次 `user_notes_count`，補上 `has_new_discussions`
5. 更新 `meta.json.last_sync`

這份快取就是後續 Dashboard、Analytics、Timeline、Chat 與報表的共同資料來源。

## 3. 專案盤點

同步完成後，使用者通常會先在 `Dashboard` 盤點：

- 本週新增 / 更新 / 開啟中 / 風險數量
- 本週新增 Issue 清單
- Focus progress 與風險卡片
- 逾期與即將到期提醒

需要更深入時，再切換到：

- `Analytics` 看 burndown、工作量、交付與 lifecycle
- `Timeline` 看 milestone / assignee / module 的時間分布
- `Table` 做條件篩選與排序

## 4. 深入單一 Issue

從 Dashboard、Table 或 Timeline 點進 Issue 後，使用者可看到：

- 基本欄位：state、module、assignees、milestone、建立與更新時間
- `related merge requests`
- `linked issues`
- `discussions`
- `AI summary`

這個流程主要用來回答「這張 Issue 現在到底進到哪裡」。

## 5. Issue Arrange 工作流

當使用者需要整理某些 Issue 給主管、跨部門或會議使用時，會進入 `Issue Arrange`：

1. 貼入多個 Issue URL，或一個 GitLab filter URL
2. `Preview` 確認實際要處理的 Issue 清單
3. 選 prompt template 或直接修改 system prompt
4. 執行單筆 / 批次整理
5. 取得兩份輸出：
   - scrape：整理前的原始 Issue 文本
   - result：LLM 生成的摘要結果
6. 需要表格時再匯出 Excel
7. 所有輸出都可在歷史面板重開、預覽與開檔

## 6. 對外輸出

當專案狀態確認後，可進一步輸出：

- `POST /api/report/weekly`：Markdown 週報
- `GET /api/report/html`：帶樣式 HTML
- Electron `printToPDF`：PDF
- `Issue Arrange -> Export Excel`

## 7. 背景排程

後端內建 daily sync 與 weekly report 排程，但它是跟著 App 進程存活的背景執行緒：

- App 有開著才會跑
- 若需要固定時間保證執行，仍建議使用 OS 層級排程
