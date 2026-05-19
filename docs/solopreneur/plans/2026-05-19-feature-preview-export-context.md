<!--
Plan-Branch: feature/preview-export-context
-->

## Handoff Context (2026-05-19, branch: feature/preview-export-context)

### Problem Background

`preview` skill 的 comment overlay 匯出 markdown 給 agent 時，只 `> ` 那段被選的 `exact` 字串。如果該字串在頁面上出現多次（例如 `Tier 2`、`flexibility`、`the proposal` 這種常見詞），agent 無法判斷使用者標註的是哪一個位置。使用者今天回報這個問題。

### Root Cause

`comment-overlay.js` 在 `commit()`（line ~596-606）儲存 comment 時，已經呼叫 `buildAnchor(range)` 抓出 `{ exact, prefix, suffix }`——前後各 32 字元（`CTX = 32`，line 23）——存進 `localStorage`，用來在 reload / Alpine re-render 後重新定位 marker。

但 `buildMarkdown()`（line 1148-1165）匯出時只用 `c.quote.split("\n")` 把 exact 部分塞進 `> ` quote，**完全沒用到 `c.anchor.prefix` / `c.anchor.suffix`**。所以資料早就在了，只是沒匯出。

`comment-overlay.js` 在這次改動之前每個 entry 結構：

```js
{
  id, comment, ts, quote,
  anchor: { exact, prefix, suffix }  // v2，v1 可能無此欄位
}
```

### Items to Fix / Implement

- [x] 分析現況、找出 anchor 資料已存在 localStorage
- [ ] 改 `buildMarkdown()`：每個 comment 的 `> ` quote 區段改成 `prefix + **exact** + suffix` 的形式
  - 用 `**...**` markdown 標粗體包出真正被選的 exact 段
  - prefix / suffix 前後加 `…` 表示截斷感
  - 若該 entry 沒有 `anchor`（v1 舊資料 / 退化情況），fallback 只印 `exact` 維持向後相容
  - 處理 prefix / suffix 內含 `**` 的情況（罕見，但 markdown bold 衝突要 escape）
  - 多行 prefix/exact/suffix：split `\n`，每行前面都加 `> `（維持現在的 quote block 行為）
- [ ] 同步 `SKILL.md` 的 "What the user sees" 段落：說明 export 出來的 quote 帶 context（不要寫死格式細節，但講清楚 agent 拿到的是包含前後 context 的 quote）
- [ ] 手動測試：寫一個有重複字串的 demo HTML，標兩個一樣的字串，匯出 markdown，確認兩個 quote 不同
- [ ] 開 PR

### Key Files

| path | description |
|------|-------------|
| `plugins/solopreneur/skills/preview/assets/comment-overlay.js` | 主要改動：`buildMarkdown()`（line ~1148），唯一要動的地方 |
| `plugins/solopreneur/skills/preview/SKILL.md` | 同步 `## The comment overlay (what the user sees)` 區段對 export markdown 的描述（line ~298-304） |

### Decision Notes

- 走 Option A（從討論的 4 個選項裡選的）：匯出時帶 prefix/suffix context。理由：資料已抓、改動最小、32+exact+32 字元指紋在自然語言裡幾乎不可能重複。
- 不做 Option C（heading breadcrumb）、Option D（HTML stable id）——避免 over-engineer，A 已足夠解決使用者回報的問題。
- 向後相容：v1 舊 localStorage 資料沒有 `anchor`，fallback 只印 exact。新版本不破壞舊資料。

### Expected Output Shape

```markdown
### comment 3
> …pricing flexibility lets teams **scale tiers** without renegotiation…

我覺得 flexibility 不該變動詞，這裡語意不清
```

被選的部分用 `**…**` 包起來；前後 32 字元 context 用 `…` 截斷標示。整段仍是 markdown blockquote（前面 `> `）。

### Current Progress

Not started — analysis done, plan written, ready to implement `buildMarkdown()`.
