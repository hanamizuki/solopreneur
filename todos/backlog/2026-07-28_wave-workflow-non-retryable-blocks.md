# wave-workflow 會重試「刻意拒絕」的 blocked 結果

`wave-workflow.md:56-58` 的 retry helper 對「非 success 且 `github_number` 為 null」
的結果一律重試，最多 `max_retries`（預設 2）次。這條規則的原意寫在同一段：clean
pre-PR failure ＝ agent 死掉或被跳過，重試是安全的。

但 PR #148 之後，`pr-subagent-template.md` 的 plan review gate 會在「調整後重跑一次
仍是 `Needs revision` / `Needs rethink`」時**主動**回 `status: "blocked"`、
`github_number: null`。這是**刻意的拒絕**，不是 transient failure，形狀卻和上面那條
規則完全一樣。

後果：

- 一個「跑一次、再重跑一次就停」的 gate，實際會跨 3 次完整 attempt 跑到 6 次 review
- review 有不確定性，第三次 attempt 可能翻成 `Ready to implement` 而放行 —— 正是這個
  gate 存在要擋的事

## 為什麼沒在 PR #148 一起修

修正點在 `wave-workflow.md`，不在該 PR 的授權檔案清單內，而且改 retry 判準會影響
**每一個** PR 的編排語意，不只 plan-review 這條路徑 —— blast radius 明顯大於那個 PR
的契約。由 Codex CLI review 第 5 輪指出，當時以 out-of-contract 退回並記成這則 todo。

## 可能作法（待評估）

1. Result JSON 加 `retryable: false`（或沿用 greenlight 既有的 `reason_class`
   詞彙，見 `greenlight/SKILL.md` Escalation taxonomy），retry helper 改讀這個欄位
   而不是只看 `github_number`
2. 只針對 blocked + 特定 reason 短路，其餘 retry 行為不動

方案 1 和 greenlight 既有的 `reason_class`（`transient-dependency` /
`invariant-violation` / `authority-boundary`）語意重疊 —— plan-review 的拒絕屬於
`invariant-violation`（不該重試）。優先考慮沿用既有詞彙，不要再發明一組。

## 相關

- `skills/solopreneur/autopilot/references/wave-workflow.md:56-63`
- `skills/solopreneur/autopilot/references/pr-subagent-template.md`（plan review gate）
- `skills/solopreneur/greenlight/SKILL.md`（`reason_class` 既有定義）
