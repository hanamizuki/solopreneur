# Preview：把 comment-overlay 樣式從 template.html 拆出

繼承自 PR #46（2026-05-20 開，2026-08-14 close：patch 針對 v0.6.0
symmetric-layout 遷移前的 `plugins/solopreneur/` 舊路徑，無法 rebase，
需對新結構重做）。

## 問題（2026-08-14 驗證仍存在）

`skills/solopreneur/preview/assets/template.html` 的 inline `<style>`
內嵌約 350 行 comment-overlay 樣式（`.cmt-*`、`mark.cmt-mark`、`del`/`ins`、
diff-clean toggle、`@keyframes cmtFlash`/`cmtSheetUp`、mobile sheet），與基礎
排版混在一起。SKILL.md 要 agent「copy template.html in」，但客製非平凡版面
（tabs、cards、dashboard）時 agent 常整段重寫 `<style>`，把 overlay 樣式
無聲弄丟——留言功能邏輯照常、視覺全壞。

## #46 的解法方向（重做時參考）

拆出獨立 `comment-overlay.css`，template 以 `<link>` 引用；SKILL.md 的
客製指引改為「重寫版面樣式、不動 overlay stylesheet」。

## 前置依賴

PR #176（`agent/preview-local-first`，draft）若定案會重構 preview 交付
機制——先等它裁決，避免對同一區域做兩次結構手術。
