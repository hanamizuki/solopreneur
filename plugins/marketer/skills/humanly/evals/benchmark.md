# Humanly Benchmark

25 cases guarding the parts of the skill that are easy to break. Run per
[run-eval.md](run-eval.md) after changing any source file under `references/`.

Three kinds of case, and the last two matter more than the first:

| Group | Asks | Fails when |
|---|---|---|
| `NEW-*` | does the catalog catch it? | the pattern goes unflagged |
| `TW-*` | is the Taiwan layer applied? | mainland vocabulary or half-width punctuation survives |
| `FID-*` | is the protected list held? | a fact, price, name, quote or commitment moved |
| `OVER-*` | did the rewrite add its own slop? | fake candor, staccato drama, aphorisms or an invented anecdote appear |

A skill that scores 10/10 on `NEW-*` and fails one `FID-*` is worse than useless:
it produces confident, human-sounding text that says something the author never
said. `FID-*` and `OVER-*` are pass/fail, not scored.

---

## NEW — the 10 patterns added in the zh catalog (#41–#50)

**NEW-01 · 立場真空 (#41)** · profile `blog`
> 兩種筆記法各有優缺點，適合的工具因人而異，最終還是取決於個人的使用習慣。

Must flag: no position taken. Must NOT pick a side for the author — expected
output carries `（需作者補充：所以你選哪個？為什麼？）` or an equivalent marker.

**NEW-02 · 公式化開場 (#42)** · profile `blog`
> 在當今 AI 技術快速發展的背景下，內容創作正面臨前所未有的挑戰與機遇。今天要跟你分享我怎麼用 AI 改稿。

Must flag: era-hat opening. Expected fix deletes sentence 1 entirely and opens on
the concrete action.

**NEW-03 · 金句公式 (#43)** · profile `social-zh`
> 筆記不是工具，而是一面照見你思考方式的鏡子。時間管理，說穿了是一場關於自我認識的修行。

Must flag: two consecutive aphorisms. Density rule is one per piece.

**NEW-04 · 假坦白鉤子 (#44)** · profile `social-zh`
> 說真的？這堂課會不會太貴，我想很多人都在猶豫。老實說，投資自己永遠不嫌貴。

Must flag: 「說真的」「老實說」as standalone hooks in front of ordinary claims.

**NEW-05 · 戲劇短句轟炸 (#45)** · profile `blog`
> 然後，一切都變了。沒有預兆。沒有回頭路。市場，重新洗牌。

Must flag: four staccato fragments in a row. Must NOT be "fixed" by making every
sentence long — that is the #35 failure in the other direction.

**NEW-06 · 勸誡反問收尾 (#46)** · profile `blog`
> 與其焦慮 AI 會不會取代你，不如現在就開始學習。畢竟機會永遠留給準備好的人，不是嗎？

Must flag: exhortation + aphorism + rhetorical question as the closing.

**NEW-07 · 幻覺引用 (#47)** · profile `blog`
> 哈佛研究指出，使用筆記系統的工作者生產力提升 47.3%。愛因斯坦說：「複利是世界第八大奇蹟。」

Must flag both. Expected output keeps **both sentences verbatim** behind
〔需查證來源〕. Fails if the skill deletes them, "corrects" the figure, or
substitutes a different source.

**NEW-08 · AI 工具殘留 (#48)** · profile `blog`
> 完整教學在這裡：https://example.com/guide?utm_source=chatgpt.com&utm_medium=chat

Must flag: `utm_source=chatgpt.com` stripped, the link itself preserved.

**NEW-09 · 模板佔位 (#49)** · profile `blog`
> 歡迎加入 [產品名稱]，我們是 XX 公司旗下最受歡迎的服務。

Must flag both placeholders. Must NOT invent a product or company name.

**NEW-10 · Markdown 錯置 (#50)** · profile `social-zh`
> **重點來了**：這次更新修好了兩個問題
> - 匯出速度變快
> - 深色模式不再閃爍

Must flag: Threads/IG do not render Markdown. Bold and bullets converted to plain
text.

---

## TW — Taiwan localization layer

**TW-01 · 中國用語** · profile `blog`
> 這個視頻的質量很高，信息量也大，建議大家用電腦屏幕看。

Must fix: 視頻→影片, 質量→品質, 信息→資訊, 屏幕→螢幕.

**TW-02 · 半形標點** · profile `social-zh`
> 我後來才發現,問題不在工具,而在流程.

Must fix: half-width `,` and `.` → full-width `，` `。`.

**TW-03 · 專有名詞不改** · profile `blog`
> 我在小紅書上看到這篇，後來在公眾號又被轉了一次。

Must NOT change 小紅書 / 公眾號. They are proper nouns, not vocabulary.

**TW-04 · 引號內原話不動** · profile `blog`
> 他在訪談裡說：「這個視頻的質量真的不行。」

Must NOT change 視頻 / 質量 — they sit inside a quotation. Protected.

**TW-05 · 玩梗放行** · profile `social-zh`
> 這也太內卷了吧，大家冷靜一點。

Must NOT "fix" 內卷. Deliberate slang, visibly a joke.

---

## FID — the protected list (pass/fail)

Each case is a text with AI smell *around* a protected item. The rewrite must
clean the smell and leave the protected item byte-identical.

**FID-01 · 價格與優惠碼**
> 這是一堂充滿啟發、扎實豐富的課程，帶你邁向全新高峰。早鳥價 4,800 元，折扣碼 EARLY500，只到 3/31。

Protected: `4,800`, `EARLY500`, `3/31`. The promotional sentence should go.

**FID-02 · 精確度不得漂移**
> 我們的開信率大約 42%，這個數字標誌著電子報策略的重大突破。

Protected: `約 42%` stays `約 42%`. Fails if it becomes 「超過四成」 or `42%`.

**FID-03 · 專名不被同義替換**
> 《超級個體工作術》是我今年的主力產品。這門課程幫助許多學員成長，這個課程也將持續迭代。

Protected: the course name. Fails if the second mention becomes 「這門課程」 —
that is synonym cycling (#11) applied to a proper noun.

**FID-04 · 作者的 UTM 不能清**
> 報名連結在這：https://example.com/signup?utm_source=newsletter

Protected: `utm_source=newsletter` is the author's own tracking. Only AI-tool
parameters get stripped (#48). Fails if this is removed.

**FID-05 · 承諾條款一字不動**
> 我們超級用心地為您服務！14 天內可全額退費，不需要任何理由。

Protected: `14 天內`、`全額`、`不需要任何理由`. The sycophancy goes, the terms
stay verbatim.

**FID-06 · 見證原話與真名**
> 學員小美說：「我上完課的第三個月接到第一個案子。」這體現了我們課程的卓越品質。

Protected: `小美` and the quoted sentence. Cut the significance inflation only.
Fails if 小美 becomes 「一位學員」.

**FID-07 · CTA 力道不得改弱**
> 立即報名，名額只剩 12 個，這將是你職涯的轉捩點！

Protected: the imperative and `12`. 「職涯的轉捩點」 is inflation and should go;
「立即報名，名額只剩 12 個」 is a working CTA and stays at full strength.

---

## OVER — over-correction (pass/fail)

The inputs below are **flat but honest**. The known failure mode is that a skill
told to "add voice" invents some. Every case fails if the output contains a hook,
an aphorism, a staccato run, or a memory the input never had.

**OVER-01 · 不准編作者的經歷**
> 我們的部署流程從三天縮短到半天。加班時數沒有明顯減少。

Must NOT produce 「我以前一直以為工具能解決一切，後來我錯了」 or any other
invented turning point. The author never said it. Acceptable: mark
`（需作者補充：加班為什麼沒少？）`.

**OVER-02 · 不准加假坦白鉤子**
> 這個功能把三個步驟縮成一個按鈕。

Already clean and concrete. Must NOT come back as 「說真的，這個功能……」 or
「老實說，我們把三個步驟縮成一個按鈕」.

**OVER-03 · 不准把節奏改成短句轟炸**
> 那次改版之後，後台數據整個變了，舊的爆款題目全部失靈，我們花了大概兩個月才摸出新的節奏。

One good long sentence. Must NOT come back as 「一切都變了。沒有預兆。全部失靈。」
Breaking uniformity means *varying* length, not making everything short (#45).

---

Source: case design adapted from
[speak-human-tw](https://github.com/Raymondhou0917/speak-human-tw)'s benchmark
(MIT License). The `FID-*` and `OVER-*` groups are specific to this skill.
