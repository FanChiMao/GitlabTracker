# Gitlab Tracker

Electron + HTML + TypeScript 前端，搭配 Python FastAPI 後端的桌面應用程式。

## 主要功能

- 週摘要
- 本週新增 issue
- 本週重點推進
- 風險與阻塞
- 每日定時同步
- 每週五自動產生週報
- 支援直接從 GitLab API 抓資料，或匯入既有 `gitlab_issues_full.json`

## 專案結構

- `src/`: Electron main / preload
- `renderer/`: HTML + CSS + TypeScript UI
- `backend/`: Python FastAPI 後端、GitLab 抓取、報表生成與排程

## 開發模式

### 1. 安裝前端依賴

```bash
npm install
```

### 2. 安裝 Python 依賴

```bash
pip install -r backend/requirements.txt
```

### 3. 啟動

```bash
npm run dev
```

## 打包

### Electron 應用

```bash
npm run dist
```

### Python 後端（建議先包成單檔 exe，再讓 Electron 帶進去）

```bash
pip install pyinstaller
pyinstaller -F backend/app.py -n gitlab-tracker-backend
```

打包後把輸出的執行檔放到：

```text
backend/dist/
```

Electron 在 packaged mode 會優先啟動：

- Windows: `backend/dist/gitlab-tracker-backend.exe`
- macOS/Linux: `backend/dist/gitlab-tracker-backend`

## 排程說明

目前內建的每日同步與週五週報排程，會在 **應用程式開啟時** 生效。

如果你希望 **應用程式關閉後也能定時執行**，建議額外用：

- Windows Task Scheduler
- cron

直接呼叫：

```bash
python backend/app.py --once fetch
python backend/app.py --once weekly-report
```

## 建議後續擴充

- 加入 MR / notes / discussion 抓取
- 加入 owner / milestone / module 圖表
- 加入 Markdown / Excel / HTML 多格式週報輸出
- 加入登入測試與 SSL 憑證設定
