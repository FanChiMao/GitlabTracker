# Gitlab Tracker Documentation

這份文件集對齊目前的程式碼結構：`src/` 的 Electron main process、`frontend/` 的 partial-based UI，以及 `backend/app.py` 提供的 FastAPI 與 Issue Arrange / Reporting 能力。

## 文件地圖

| 路徑                                             | 內容                                         | 適合誰           |
| ------------------------------------------------ | -------------------------------------------- | ---------------- |
| [architecture/README.md](architecture/README.md) | 執行架構、資料模型、關鍵設計決策             | 開發者、AI agent |
| [product/README.md](product/README.md)           | 產品定位、畫面流程、使用情境                 | PM、設計、開發   |
| [operations/README.md](operations/README.md)     | 本機啟動、打包、疑難排解                     | 開發者、維運     |
| [specs/API_SPEC.md](specs/API_SPEC.md)           | FastAPI endpoint 與 request / response shape | 前後端開發者     |
| [quality/NFR.md](quality/NFR.md)                 | 非功能需求與品質目標                         | PM、QA、開發     |
| [sercurity/SERCURITY.md](sercurity/SERCURITY.md) | 安全性與敏感資料處理說明                     | 開發者、維運     |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | 提交流程與開發慣例                           | Contributor      |
| [GLOSSARY.md](GLOSSARY.md)                       | 專案術語                                     | 所有人           |

## 建議閱讀順序

1. 先看 [README.md](../README.md) 了解整體用途與啟動方式。
2. 看 [product/user-flow.md](product/user-flow.md) 熟悉目前 UI 與主要操作。
3. 看 [architecture/runtime-overview.md](architecture/runtime-overview.md) 與 [architecture/data-model.md](architecture/data-model.md) 了解重構後的實作方式。
4. 需要串接或修改前後端資料時，再看 [specs/API_SPEC.md](specs/API_SPEC.md)。
5. 需要本機執行或打包時，參考 [operations/local-setup.md](operations/local-setup.md) 與 [operations/build-and-release.md](operations/build-and-release.md)。

## 本次同步重點

- 文件已改為使用目前的 `frontend/` 目錄，而不是舊的 `renderer/` 描述。
- 補上 `Issue Arrange`、批次整理、Excel 匯出與歷史紀錄。
- 補上 `Dashboard / Analytics / Timeline / Table / AI Chat` 相關流程。
- 補上 `arrange_exports/`、HTML/PDF 報表與最新 FastAPI endpoint。
