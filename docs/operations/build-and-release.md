# Build & Release

## 1. 打包順序

`npm run dist` 會依序執行：

```text
1. tsc -p tsconfig.json                   # TS → dist/
2. PyInstaller --onedir backend/app.py    # Python → backend/dist/gitlab-tracker-backend/
3. electron-builder                       # → release/Gitlab Tracker Setup x.y.z.exe
```

設定來源：

- TS：[tsconfig.json](../../tsconfig.json)
- PyInstaller：[backend/gitlab-tracker-backend.spec](../../backend/gitlab-tracker-backend.spec)（也可由 `pack:backend` script 動態產生）
- electron-builder：[package.json](../../package.json) 的 `"build"` 區段

## 2. 確保 PyInstaller hidden imports

Uvicorn 內部用了大量動態 import，[`package.json`](../../package.json) 的 `pack:backend` 已加上：

```text
--hidden-import uvicorn.logging
--hidden-import uvicorn.lifespan
--hidden-import uvicorn.lifespan.on
--hidden-import uvicorn.protocols
--hidden-import uvicorn.protocols.http.h11_impl
--hidden-import uvicorn.protocols.http.httptools_impl
--hidden-import uvicorn.protocols.websockets.wsproto_impl
--hidden-import uvicorn.loops.asyncio
```

> 新增 Python 套件後，若打包後啟動失敗（看 `release/win-unpacked/...` 的後端 stderr），通常都是缺 hidden import。

## 3. extraResources 路徑

`backend/dist/` 整個資料夾會被以 `extraResources` 帶入 `resources/backend/`。Main process 在 packaged 模式會用：

```text
%APP%/resources/backend/dist/gitlab-tracker-backend/gitlab-tracker-backend.exe
```

對應 [main.ts](../../src/main.ts) `startBackend()` 的 `packagedExe` 路徑。

## 4. 安裝檔輸出

- 路徑：`release/Gitlab Tracker Setup <version>.exe`
- NSIS 設定：`deleteAppDataOnUninstall: true`，解除安裝會清掉使用者的 `tracker-data/`，**含 token，請告知使用者**。

## 5. Release Checklist

- [ ] `package.json` `version` bump
- [ ] `renderer/index.html` 顯示版本一致（目前是寫死 `v1.0.0`，請同步）
- [ ] `npm run dist` 成功
- [ ] 安裝後驗證：
  - [ ] 可開啟主視窗
  - [ ] `GET /api/health` 200
  - [ ] 設定 + 同步成功
  - [ ] 產週報、匯出 PDF 成功
  - [ ] 解除安裝乾淨

## 6. 簽章與分發（待補）

目前未做 code signing。建議分發前先：

- 取得 EV / OV code signing 憑證
- 在 `package.json` `build.win` 加 `certificateFile` / `certificatePassword`
- 啟用 electron-builder 自動簽章

否則 SmartScreen 會擋。
