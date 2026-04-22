# ADR 0002 — Renderer 不使用前端框架

- **狀態**：Accepted
- **日期**：2025

## Context

Renderer 邏輯約 1.5k 行 TS，主要是：表單 + Tab 切換 + 表格渲染 + Chart.js 圖表 + Issue drawer + Chat 介面。

## Decision

採用 **Vanilla TypeScript + 直接 DOM 操作**（搭配 `<template>` 與 `innerHTML` 拼裝），不引入 React / Vue / Svelte。

## Consequences

**優點**

- Bundle 小、啟動快、無 build pipeline。
- 對 AI Agent 友善：所有 DOM 對應可在 [index.html](../../../renderer/index.html) 直接看到 id/class，與 [app.ts](../../../renderer/app.ts) 1:1 對應。

**代價**

- 狀態管理需自己手動同步（目前是「整塊 re-render + 局部 update」混合）。
- 若功能增長到 5k+ 行需重新評估。

## Guideline for AI Agent

- 修改 UI 時，**先在 `index.html` 找到對應 element id**，再改 `app.ts` 中對應的 query selector / handler。
- 新增可重用元件時，使用 `<template>` 元素，避免引入框架。
