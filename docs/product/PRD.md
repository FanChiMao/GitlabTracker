# Gitlab Tracker Product Requirements Document

## 1. 問題定義

團隊使用 GitLab 管理工作時，常見的痛點不是「沒有資料」，而是資料分散在 Issue、discussion、MR、label、milestone 與不同人的更新節奏中。

Gitlab Tracker 目標是縮短以下工作：

- PM 每週整理專案狀態與風險。
- Tech Lead 追蹤 milestone、工作量與逾期風險。
- 工程師快速回顧單一 Issue 的現況、阻塞與相關變更。
- 需要對外說明時，將一批 Issue 轉成可閱讀的整理稿或 Excel。

## 2. 目標使用者

| Persona                | 需求                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| Project Manager        | 快速掌握本週新增、風險、工作量與可分享的報表                                 |
| Tech Lead              | 追蹤 milestone burndown、MR 連結狀態、blocked issue 與 lifecycle             |
| Engineer               | 看單一 Issue 的完整脈絡，包含 discussions、linked issues、相關 MR 與 AI 摘要 |
| Stakeholder / Reviewer | 透過整理後的 Issue 摘要、週報與 PDF 理解進度                                 |

## 3. 產品目標

- 把 GitLab 專案狀態整理時間從小時級降到分鐘級。
- 降低「需要讀很多 discussion 才知道 Issue 在做什麼」的成本。
- 提供可重複使用的 Issue 整理流程，支援 batch、模板與歷史輸出。
- 保持桌面 App 模式，讓內網或自架 GitLab 專案也能使用。

## 4. In Scope

### 核心追蹤

- GitLab Base URL、Token、Project Path/ID 設定
- 直接抓 GitLab API 或匯入現有 JSON
- 本機快取 Issue，支援 dashboard、analytics、timeline、table
- 單一 Issue 詳情查看：discussion、related merge requests、linked issues

### 分析與輸出

- Dashboard KPI 與風險卡片
- Analytics：burndown、workload、label distribution、lifecycle、delivery follow-ups
- Timeline / Calendar 檢視
- Markdown 週報
- HTML 報表與 PDF 匯出

### AI 功能

- AI 討論摘要
- AI Chat over Issues
- Issue Arrange 工作區
- 自訂 arrange prompt
- LLM model fallback

### Issue Arrange 工作區

- 貼入多個 Issue URL
- 貼入 GitLab filter URL，自動展開成 Issue 清單
- 單筆或批次執行 scrape + LLM 整理
- 匯出 Excel
- 保存 scrape / result / excel 歷史紀錄

## 5. Out of Scope

- 修改 GitLab Issue 內容
- 多專案聚合 dashboard
- 雲端多人協作與帳號系統
- 行動版或 Web SaaS 版本

## 6. 主要功能清單

| ID   | 功能                                                       | 優先級 |
| ---- | ---------------------------------------------------------- | ------ |
| F-1  | GitLab 連線設定與 project ref 歷史                         | P0     |
| F-2  | 同步 / 匯入 Issue 快取                                     | P0     |
| F-3  | Dashboard、Analytics、Timeline、Table                      | P0     |
| F-4  | 單一 Issue 詳情與 AI 討論摘要                              | P0     |
| F-5  | Markdown / HTML / PDF 報表                                 | P0     |
| F-6  | AI Chat over cached issues                                 | P1     |
| F-7  | Issue Arrange：URL preview、filter resolve、batch LLM 整理 | P1     |
| F-8  | Excel 匯出與 arrange 歷史檢視                              | P1     |
| F-9  | UI 偏好設定：主題、縮放、模型清單                          | P2     |
| F-10 | 外部連結瀏覽器偏好                                         | P3     |

## 7. 成功指標

- 使用者可在一次同步後，於同一個畫面完成專案風險盤點。
- 使用者可在 5 分鐘內將一批 Issue 整理成可分享輸出。
- 報表輸出不需額外手工整理 Markdown。
- AI 輸出引用 Issue 時能以 `#IID` 為主，降低誤解。
