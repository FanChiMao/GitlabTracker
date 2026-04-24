# Script split plan

目前 `bootstrap.js` 先載入頁面 HTML partial，再載入既有 `../dist/renderer/app.js`，所以功能不變。

下一階段建議把 `legacy-app.ts` 拆成：

```txt
core/dom.ts
core/api.ts
core/state.ts
core/preferences.ts
pages/dashboard.ts
pages/analytics.ts
pages/timeline.ts
pages/arrange.ts
pages/connections.ts
pages/preferences.ts
widgets/issue-detail.ts
widgets/chat.ts
main.ts
```
