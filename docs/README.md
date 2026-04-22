# Gitlab Tracker — Documentation Index

本文件夾收錄 Gitlab Tracker 桌面應用程式的所有開發、維運、產品與品質文件，目的是讓 **新加入的工程師** 與 **AI Coding Agent** 能在最短時間內理解系統並安全地修改程式碼。

> Gitlab Tracker 是一個 Electron + TypeScript 前端、Python FastAPI 後端的桌面 App，協助專案經理與工程團隊每日同步 GitLab Issues、產生週報、並用 LLM 做 Issue 對話摘要與問答。

## 文件地圖

| 區塊 | 內容 | 主要讀者 |
| --- | --- | --- |
| [architecture/](architecture/README.md) | 系統架構、Runtime、資料模型、ADR | 工程師、AI Agent |
| [product/](product/README.md) | PRD、使用者流程、產品流程 | PM、Designer、工程師 |
| [operations/](operations/README.md) | 本機開發、打包、發佈、Troubleshooting | 工程師、SRE |
| [specs/API_SPEC.md](specs/API_SPEC.md) | 後端 REST API 規格 | 前後端整合工程師 |
| [quality/NFR.md](quality/NFR.md) | 非功能需求（效能、可用性、相容性） | PM、QA、架構師 |
| [sercurity/SERCURITY.md](sercurity/SERCURITY.md) | 安全模型、Token 處理、外部呼叫 | 安全審查、工程師 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 程式碼規範、PR 流程、Commit 慣例 | 所有 contributor |
| [GLOSSARY.md](GLOSSARY.md) | 專案術語表 | 全部 |

## 快速導覽

- 想 **跑起專案** → 看 [operations/local-setup.md](operations/local-setup.md)
- 想 **改後端 API** → 看 [specs/API_SPEC.md](specs/API_SPEC.md) + [architecture/runtime-overview.md](architecture/runtime-overview.md)
- 想 **加新功能** → 先看 [product/PRD.md](product/PRD.md) 與 [architecture/data-model.md](architecture/data-model.md)
- 想 **打包發佈** → 看 [operations/build-and-release.md](operations/build-and-release.md)
- 遇到問題 → 看 [operations/troubleshooting.md](operations/troubleshooting.md)

## 給 AI Agent 的提示

1. 任何修改前，先讀 [architecture/runtime-overview.md](architecture/runtime-overview.md) 了解 Electron ↔ FastAPI ↔ GitLab/Gemini 的呼叫鏈。
2. 後端是 **Single-process FastAPI + 背景排程 thread**，前端透過 `http://127.0.0.1:8765` 呼叫；不要新增其他通訊管道。
3. 所有持久化資料都在 [config_store.py](../backend/core/config_store.py) 定義的 `data_dir()` 下，正式環境會被 main process 注入 `GITLAB_TRACKER_DATA_DIR` 環境變數，**不要直接寫入 backend/data**。
4. 新增 API 一定要同步更新 [specs/API_SPEC.md](specs/API_SPEC.md)。
5. 新增 / 刪除使用者操作流程要同步更新 [product/user-flow.md](product/user-flow.md)。
