# User Flow

這份文件從使用者視角描述目前 UI 的主要操作路徑。

## 1. 首次啟動

1. 開啟 App
2. 進入 `Connections`
3. 輸入 GitLab 與 Gemini 設定
4. 儲存後按 `Sync Now`

如果只想驗證畫面，也可以先用 `Import JSON` 載入既有 Issue 資料。

## 2. Dashboard 主流程

`Dashboard` 是預設首頁，包含四個 tab：

- `Dashboard`
  - 週摘要 KPI
  - 最近更新
  - 本週新增
  - Focus progress
  - 風險與到期提醒
- `Analytics`
  - Burndown
  - Workload
  - Label distribution
  - Milestone progress
  - Lifecycle
- `Timeline`
  - Gantt / Calendar
  - milestone / assignee / module 分組
  - 月 / 週視圖
- `Table`
  - 搜尋、狀態、milestone、label、日期篩選
  - 欄位排序

## 3. 單一 Issue 查看

使用者從列表點進單一 Issue 後，會打開 overlay：

- 查看 Issue 基本資訊與 labels
- 查看 linked MR 與 linked issues
- 查看完整 discussion
- 點 `AI 摘要` 生成討論摘要
- 點 GitLab 連結時，Electron 會先詢問要用哪個外部瀏覽器開啟

## 4. AI Chat

右下角浮動按鈕可開啟 `AI Issue Chat`：

- 問題會根據目前快取的所有 Issue 回答
- 聊天歷史會帶到下一輪請求
- 回答應該用 `#IID` 引用 Issue
- 如果沒有同步資料或沒有 Gemini API Key，後端會拒絕請求

## 5. Issue Arrange

這是本次重點更新的工作區。

### 入口資料

- 多個 GitLab Issue URL
- 一個 GitLab filter URL

### 主要互動

1. `Preview`
   - 驗證 URL
   - 展開 filter URL
   - 產生可處理 Issue 清單
2. 編輯 prompt
   - 使用內建 prompt
   - 儲存為 local prompt template
3. 執行
   - 單筆處理
   - 批次處理
   - 只 scrape
   - 只跑 LLM
4. 檢視結果
   - 左側看 raw issue text
   - 右側看 LLM 結果
5. 匯出
   - Excel
   - 歷史紀錄重開與預覽

## 6. Preferences

`Preferences` 目前可調整：

- 淺色 / 深色主題
- UI 縮放
- Gemini model 清單

部分偏好會存在瀏覽器 localStorage，而不是後端 `config.json`。
