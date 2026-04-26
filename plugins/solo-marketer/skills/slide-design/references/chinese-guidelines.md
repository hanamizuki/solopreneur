# Chinese Typography & Writing Guidelines for Slides

Slide text in 繁體中文 / 簡體中文 / CJK has specific AI-slop patterns that kill credibility with Chinese audiences. Follow these guidelines when writing, then run `/humanly` review before shipping.

## Forbidden punctuation (AI signature)

| Symbol | Why avoid | Replace with |
|--------|-----------|--------------|
| `——` (em-dash) | #1 AI tell in Chinese. `X —— Y` reveal structure signals LLM | Period `。` or line break |
| `；` (Chinese semicolon) | Rarely used in natural social writing | Period |
| `：` (colon for drama) | `「重點是：」` style colon inflates | Remove, state directly |

**Rule of thumb:** If you're using `——` to build up to a reveal, rewrite so the reveal is just the statement.

```
❌ 客服不只是回信 —— 是查資料 + 產品對話
✅ 客服是查資料 + 產品對話
```

## Forbidden sentence patterns

### 1. 「不是 X，是 Y」否定式排比

Using 1 time = fine. Using 3+ times across a deck = AI signature.

```
❌ (all 4 in the same deck)
  · 推廣不是發文而已 —— 是兩條軸在跑
  · 客服不只是回信 —— 是查資料 + 產品對話
  · 這不是單向關係 —— 是會進化的 loop
  · 省的是 token，救的是正確率

✅ (vary)
  · 推廣有兩條軸在跑
  · 客服是查資料 + 產品對話
  · 這是會進化的 loop
  · (delete the 4th, it's redundant after Tips already said it)
```

### 2. 金句/對仗 tagline

Slide taglines that read like "quote cards" are AI-generated:

```
❌ 一條是反射神經，一條是大腦。兩邊一起動，才是一個真的活的 App。
✅ 反射神經 + 大腦，像一個活的 App。
```

```
❌ 省的是 token，救的是正確率。
✅ (just delete — the Tips already made the point)
```

### 3. 「其實」「才是」軟化詞

AI uses these to smooth transitions. Remove them.

```
❌ 但其實，App 是持續在動的東西
✅ App 是持續在動的東西
```

### 4. 文學腔比喻

```
❌ 像感官一樣，服務不睡覺地聽著世界
✅ 服務 24/7 在聽
```

### 5. 三段排比

Three parallel clauses (三段式) feels structured but is AI-rhythm. Use two or four.

```
❌ 現在你有 A、有 B、有無數 C
✅ 現在 A、B、無數 C 陪你一起
```

## Traditional Chinese specific

- **正體中文 + 台灣用語** — avoid 大陸用語 if audience is Taiwan
  - `影片` not `視頻`
  - `軟體` not `軟件`
  - `使用者` not `用戶` (though `用戶` is increasingly natural)
- **Use half-width punctuation around Latin terms**: `用 Claude Code，不用 Cursor` 比 `用 Claude Code ，不用 Cursor` 自然
- **Monospace for code / commands only** — don't monospace Chinese text, it looks wrong

## Integration with `/humanly` skill

After writing all slide text, run:

```
/humanly review slide content in [path]
```

Expect it to flag:
- `——` usage
- Repeated "不是 X 是 Y" patterns
- Inflated/poetic metaphors
- 金句 taglines

**Apply all P1 findings. P2 is judgment call — apply if you have time.**

## Pre-write cheatsheet

When drafting new slide text:

1. **State, don't build up.** The reveal should be the sentence, not the punctuation.
2. **Cut softeners.** 其實、真的、還有、而且 — usually removable.
3. **Two or four, not three.** Avoid rule of three in lists.
4. **One金句 per deck, max.** Callback quotes are fine but ration them.
5. **Sub-clauses use period, not dash.** Chinese readers parse periods well; em-dashes feel translated.

## Context note

These guidelines apply to **slide text** (what shows on screen) and **formal script**. For casual speaker notes (script.md's 講稿 paragraphs), some rules relax because you're writing dialogue, not copy. Em-dashes in speaker notes = stage pauses, which is fine.

## Example before/after

### Before (AI-smelled, ~32/50 humanly score)

> 推廣不是發文而已 —— 是兩條軸同時在跑。一條是反射神經，一條是大腦。兩邊一起動，才是一個真的活的 App。

### After (clean, ~42/50)

> 推廣有兩條軸在跑。
> 反射神經 + 大腦，像一個活的 App。

Drops: `——`, `不是 X 是 Y`, 三段金句
Keeps: metaphor (reflexes + brain), callback to "活的 App" from earlier slide
