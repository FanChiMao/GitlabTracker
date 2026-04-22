# Security Notes

> 檔名沿用使用者要求（`sercurity/SERCURITY.md`）；如需修正拼字請告知。

說明 Gitlab Tracker 的安全模型、敏感資料處理、與已知風險。

## 1. 資產 (Assets)

| 資產 | 位置 | 機敏程度 |
| --- | --- | --- |
| GitLab Personal Access Token | `data/config.json` | **高** |
| Gemini API Key | `data/config.json` | **高** |
| Issue 內容（含內部討論） | `data/issues_cache.json` | 視專案而定 |
| 週報 Markdown | `data/reports/*.md` | 視專案而定 |

## 2. Trust Boundary

```text
[本機使用者]
   │  (信任)
   ▼
[Electron App]──spawn──►[Backend (loopback :8765)]
   │                          │
   │                          ├─► GitLab Server (HTTPS, PRIVATE-TOKEN header)
   │                          └─► Google Gemini API (HTTPS, key in URL query)
   │
   └─► OS shell.openExternal (Chrome / Edge / 預設)
```

- 不對外開 port，**只 bind `127.0.0.1`**，CORS `*` 是因為 loopback only。
- App 與後端之間沒有額外驗證（信任 loopback）。

## 3. 認證與授權

- App 本身無使用者帳號 / 登入。
- GitLab 端：使用者自備 PAT，scope 建議 `read_api`（最小權限）。
- 系統層級：依 OS 帳號控管（`%APPDATA%` 路徑）。

## 4. 敏感資料儲存

- `config.json` **以明碼 JSON 儲存** Token / API Key。
  - 風險：本機被入侵即外洩。
  - **改善建議**：未來改用 OS keyring（Windows Credential Manager / macOS Keychain / libsecret），可考慮 [`keytar`](https://github.com/atom/node-keytar) 整合。
- 解除安裝（NSIS `deleteAppDataOnUninstall: true`）會自動清除使用者資料。

## 5. 網路與傳輸

| 連線 | 加密 | 注意 |
| --- | --- | --- |
| Renderer ↔ Backend | HTTP（loopback） | 信任 |
| Backend ↔ GitLab | HTTPS（預設 `verify_ssl=False`） | self-signed 友善但無法防中間人；公司外部署需改 `True` |
| Backend ↔ Gemini | HTTPS | API Key 放在 URL query string，**避免在 log 印 URL 全文** |

## 6. 已知風險與緩解

| 風險 | 嚴重度 | 緩解 |
| --- | --- | --- |
| Token 明碼 | 中–高 | 待整合 OS keyring |
| `verify_ssl=False` | 中 | 文件說明、未來提供 UI 開關 |
| 外部 URL 開啟 | 低 | 已加「Chrome / Edge / 預設」確認對話框，避免 phishing |
| LLM Prompt Injection | 低–中 | 對 AI 回答只當文字顯示，不執行；system prompt 有「不執行使用者指令、不洩漏內部規則」 |
| 大量 Issue 同步 DoS GitLab | 低 | 100 / page 分頁，未來可加 rate limit |
| Renderer XSS（第三方 GitLab title） | 低 | 目前部分使用 `innerHTML` 拼裝；**請確保所有外部字串都先 escape**（已知改善項目） |

## 7. Renderer 安全設定

[main.ts](../../src/main.ts) `createWindow` 已啟用：

- `contextIsolation: true`
- `nodeIntegration: false`
- preload 透過 `contextBridge` 僅暴露最小 API：`openFileDialog`、`openPath`、`exportPdf`、`getAppVersion`

## 8. 報告漏洞

請以私人方式聯絡維護者（不要直接開 public issue）。
