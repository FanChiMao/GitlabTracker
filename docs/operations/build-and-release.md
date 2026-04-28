# Build And Release

## 1. 打包指令

正式打包使用：

```powershell
npm run dist
```

流程如下：

1. `npm run build:ts`
2. `npm run pack:backend`
3. `electron-builder`

## 2. 各段輸出

### TypeScript

- 原始碼：`src/**/*.ts`、`frontend/**/*.ts`
- 輸出：`dist/`

### Python Backend

- 入口：`backend/app.py`
- 指令：`python -m PyInstaller --noconfirm --onedir --name gitlab-tracker-backend ...`
- 輸出：`backend/dist/gitlab-tracker-backend/`

### Electron Installer

- 設定來源：`package.json > build`
- 輸出目錄：`release/`
- Windows target：`nsis`

## 3. 打包後執行方式

打包版啟動時：

- Electron main process 從 `resources/backend/dist/gitlab-tracker-backend/` 啟動後端
- 後端資料目錄改為 `app.getPath('userData')/tracker-data`
- `frontend/` 會隨 app 一起打包，不走 `extraResources`

## 4. 產物位置

常見產物：

- `backend/dist/gitlab-tracker-backend/gitlab-tracker-backend.exe`
- `release/Gitlab Tracker Setup <version>.exe`
- `release/win-unpacked/`

## 5. 發版前檢查

1. 更新 `package.json` 版本號
2. 執行 `npm run format:check`
3. 執行 `npm run dist`
4. 安裝打包後的 App，確認：
   - 可以正常開啟
   - `/api/health` 正常
   - GitLab 連線設定可儲存
   - `Sync Now` 可用
   - `Issue Arrange` 可 preview / process / export Excel
   - HTML 轉 PDF 正常
   - 外部 GitLab 連結可打開

## 6. 常見打包注意事項

- PyInstaller 需要帶 Uvicorn hidden imports，這已經寫在 `package.json` 的 `pack:backend`。
- 若打包版後端啟動失敗，先看 `release/win-unpacked` 執行時的 stderr。
- `nsis.deleteAppDataOnUninstall = true`，解除安裝會刪掉 userData 內的 `tracker-data`。
