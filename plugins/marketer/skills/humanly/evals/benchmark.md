# Humanly Benchmark

30 cases guarding the parts of the skill that are easy to break. Run per
[run-eval.md](run-eval.md) after changing any source file under `references/`, or
`scripts/build-prewrite.py`.

Five groups. The first two ask whether the skill *catches* things; the last three
ask whether it *breaks* things, and those matter more.

| Group | Asks | Fails when |
|---|---|---|
| `NEW-*` (10) | does the catalog catch it? | the pattern goes unflagged |
| `TW-*` (5) | is the Taiwan layer applied? | an **unprotected** mainland term survives, or Chinese sentence punctuation stays half-width. Proper nouns (TW-03) and text inside quotations (TW-04) are *supposed* to survive — changing them is the failure |
| `FID-*` (9) | is the protected list held — and not over-reaching? | a fact, price, name, quoted speech, commitment or code string moved (FID-01…08), **or** the protected list shielded something it shouldn't (FID-09) |
| `OVER-*` (5) | did the rewrite add its own slop? | fake candor, staccato drama, aphorisms, or an **invented** number, source or memory appears |
| `PRE-*` (1) | does prewrite mode compose correctly? | the model writes mainland vocabulary or half-width punctuation *from scratch* |

A skill that scores 10/10 on `NEW-*` and fails one `FID-*` or `OVER-*` is worse
than useless: it produces confident, human-sounding text that says something the
author never said. **`FID-*`, `OVER-*` and `PRE-*` are pass/fail, not scored.**

Two standing rules for every case in every group:

1. **No invention, ever.** A rewrite may not introduce a number, price, name,
   source, date or event that is absent from the input — no matter which pattern
   it is fixing. Every `NEW-*` criterion below carries this as a second condition,
   because catching a pattern by fabricating a replacement is a worse failure than
   missing it.
2. **Inputs are novel.** No case reuses a catalog entry's own `改寫前` text. A case
   whose input is the catalog's example tests recognition, not detection — the
   reviewing agent has the answer key open in front of it.

---

## NEW — the 10 patterns added in the zh catalog (#41–#50)

**NEW-01 · 立場真空 (#41)** · profile `blog`
> 遠端工作和進辦公室各有優缺點，適合哪一種取決於團隊的性質，最終還是因人而異。

Must flag: no position taken. Must NOT pick a side for the author — expect
`（需作者補充：所以你選哪個？為什麼？）` or equivalent. Must not invent a team, a
policy, or an anecdote.

**NEW-02 · 公式化開場 (#42)** · profile `blog`
> 在數位轉型的浪潮下，中小企業正面臨前所未有的挑戰與機遇。這篇要談我們怎麼把出貨流程數位化。

Must flag: era-hat opening. Expected fix deletes sentence 1 and opens on the
concrete subject. Must NOT manufacture an opening statistic to satisfy 「第一句要有
時間、數字」 — the input has none.

**NEW-03 · 金句公式 (#43)** · profile `social-zh`
> 履歷不是一份文件，而是一面照見你職涯選擇的鏡子。求職，說穿了是一場關於自我定價的修行。

Must flag: two consecutive aphorisms (density rule is one per piece). Must not
replace them with an invented job-hunting story.

**NEW-04 · 假坦白鉤子 (#44)** · profile `social-zh`
> 老實說，這個外掛到底值不值得裝，我想很多人都在觀望。講白了，工具本身沒有好壞。

Must flag: 「老實說」「講白了」 as standalone hooks in front of ordinary claims. Must
not invent a price, a user count, or a verdict the author never gave.

**NEW-05 · 戲劇短句轟炸 (#45)** · profile `blog`
> 然後，訂單停了。沒有預警。沒有解釋。倉庫，一片死寂。

Must flag: four staccato fragments in a row. Must NOT be "fixed" by making every
sentence long — that is #35 in the other direction. Must not invent a cause for
the stopped orders; the input gives none.

**NEW-06 · 勸誡反問收尾 (#46)** · profile `blog`
> 與其擔心被同行超車，不如今天就把第一支影片拍出來。畢竟成功總是留給行動的人，不是嗎？

Must flag: exhortation + aphorism + rhetorical question as the closing. Must not
substitute an invented personal result ("我拍完第一支之後⋯⋯").

**NEW-07 · 幻覺引用 (#47)** · profile `blog`
> 史丹佛的研究顯示，遠端工作者的產出高出 23.7%。彼得杜拉克說過：「文化能把策略當早餐吃掉。」

Must flag both. Expected output keeps **both sentences verbatim** behind
〔需查證來源〕. Fails if the skill deletes them, "corrects" 23.7%, substitutes a
different source, or writes the misattribution finding into the prose in place of
the original sentence.

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
text. Must not exceed #16's one-quote-per-piece budget while doing it.

---

## TW — Taiwan localization layer

**TW-01 · 中國用語** · profile `blog`
> 這個視頻的質量很高，信息量也大，建議大家用電腦屏幕看。

Must fix: 視頻→影片, 質量→品質, 信息→資訊, 屏幕→螢幕.

**TW-02 · 半形標點** · profile `social-zh`
> 我昨天去看了場地,可以坐 40 個人,租金一小時 800.

Must fix: half-width `,` and `.` → full-width `，` `。`. The sentence is otherwise
clean, so the punctuation fix is the only thing to observe. `40` and `800` must
survive (protected numbers).

**TW-03 · 專有名詞不改** · profile `blog`
> 我在小紅書上看到這篇，後來在公眾號又被轉了一次。

Must NOT change 小紅書 / 公眾號. They are proper nouns, not vocabulary. Rewriting
公眾號 to 「粉專」 changes a fact about where something was published.

**TW-04 · 引號內原話不動** · profile `blog`
> 他在訪談裡說：「這個視頻的質量真的不行。」

Must NOT change 視頻 / 質量 — they sit inside a quotation, protected verbatim. The
colon before the quote must also survive (it is not an announcement colon).

**TW-05 · 玩梗放行** · profile `social-zh`
> 這也太內卷了吧，大家冷靜一點。

Must NOT "fix" 內卷. Deliberate slang, visibly a joke, and not on the (exhaustive)
substitution table.

---

## FID — the protected list (pass/fail)

Each case is a text with AI smell *around* a protected item. The rewrite must
clean the smell and leave the protected item byte-identical.

**FID-01 · 價格與優惠碼** · profile `blog`
> 這是一堂充滿啟發、扎實豐富的課程，帶你邁向全新高峰。早鳥價 4,800 元，折扣碼 EARLY500，只到 3/31。

The input is two sentences. The **first** is pure promotion and should go (or be
replaced by a 需作者補充 marker). The **second** carries everything protected —
`4,800`, `EARLY500`, `3/31` — and survives verbatim.

Note the profile is `blog`, where Promotional language is `strict`. The offer
line is preserved by the false-positive row in `protected-list.md`, not by a
profile. That is the point of the case.

**FID-02 · 精確度不得漂移** · profile `blog`
> 我們的開信率大約 42%，這個數字標誌著電子報策略的重大突破。

Protected: `大約 42%` stays `大約 42%`. Fails if it becomes 「超過四成」 or a bare
`42%` — precision may not drift in either direction.

**FID-03 · 專名不被同義替換** · profile `blog`
> 《超級個體工作術》是我今年的主力產品。很多人問我《超級個體工作術》會不會再開，答案是會，而且會持續迭代。

Protected: the course name, **both times**. The input deliberately repeats it,
which is exactly the bait #11 (synonym cycling) exists to remove — a model
obeying #11 alone will vary the second mention to 「這門課程」. The protected list
must stop it: proper nouns are exempt from #11.

Pass requires 《超級個體工作術》 to appear **twice, verbatim**, in the rewritten
text. Fails if the second occurrence becomes 這門課程 / 這個課程 / 這堂課 / 它, or
is dropped by collapsing the sentences. (`迭代` is Tier 2 and may be replaced.)

**FID-04 · 作者的 UTM 不能清** · profile `blog`
> 報名連結在這：https://example.com/signup?utm_source=newsletter

Protected: `utm_source=newsletter` is the author's own tracking. Only AI-tool
parameters get stripped (#48). Fails if this is removed.

**FID-05 · 承諾條款一字不動** · profile `support-email`
> 我們超級用心地為您服務！14 天內可全額退費，不需要任何理由。

Protected: `14 天內`、`全額`、`不需要任何理由`. The sycophancy goes, the terms stay
verbatim.

**FID-06 · 見證原話與真名** · profile `blog`
> 學員小美說：「我上完課的第三個月接到第一個案子。」這體現了我們課程的卓越品質。

Protected: `小美` and the quoted sentence, including its colon. Cut the
significance inflation only. Fails if 小美 becomes 「一位學員」.

**FID-07 · CTA 力道不得改弱** · profile `blog`
> 立即報名，名額只剩 12 個，這將是你職涯的轉捩點！

Protected: the imperative and `12`. 「職涯的轉捩點」 is inflation and should go;
「立即報名，名額只剩 12 個」 is a working CTA and stays at full strength.

**FID-08 · 程式碼與指令不得改寫** · profile `technical-blog`
> 這個腳本堪稱工程效率的里程碑。跑 `python3 build-prewrite.py --check` 就會驗證，模型固定用 `gpt-5.4-mini`，資料打到 `/v1/users`。

Protected: `python3 build-prewrite.py --check`, `gpt-5.4-mini`, `/v1/users` —
all verbatim. The significance inflation (「工程效率的里程碑」) should go. Fails if
the command is paraphrased into prose ("跑檢查模式"), or if the version or route
drifts. A command is the one part of a doc the reader will copy.

**FID-09 · 引號不是保護傘** · profile `blog`
> 我們的「無縫」平台提供「前所未有」的價值，讓團隊「賦能」彼此。

Nothing here is protected. These are scare quotes and promotional filler, not
quoted speech — nobody said them. The rewrite **must** strip them (#4 promotional
language, #16 quote density, Tier 1 「賦能」). Fails if the skill treats the quoted
terms as protected and preserves them — that would be the protected list blocking
the very fix it exists alongside. The attribution test: name who said it. You
can't.

---

## OVER — over-correction (pass/fail)

The inputs below are **flat but honest**, or thin on facts. The known failure mode
is that a skill told to "add voice" or "be concrete" supplies both. Every case
fails if the output contains a hook, an aphorism, a staccato run, or any fact the
input did not have.

**OVER-01 · 不准編作者的經歷** · profile `blog`
> 我們的部署流程從三天縮短到半天。加班時數沒有明顯減少。

Must NOT produce 「我以前一直以為工具能解決一切，後來我錯了」 or any other invented
turning point. Acceptable: `（需作者補充：加班為什麼沒少？）`.

**OVER-02 · 不准加假坦白鉤子** · profile `blog`
> 這個功能把三個步驟縮成一個按鈕。

Already clean and concrete. Must NOT come back as 「說真的，這個功能……」. A rewrite
that returns the sentence unchanged and says "clean" is the correct answer — the
quality score must not be used as a reason to touch it.

**OVER-03 · 不准把節奏改成短句轟炸** · profile `blog`
> 那次改版之後，後台數據整個變了，舊的爆款題目全部失靈，我們花了大概兩個月才摸出新的節奏。

One good long sentence. Must NOT come back as 「一切都變了。沒有預兆。全部失靈。」
Breaking uniformity means *varying* length, not making everything short (#45).
`大概兩個月` must not harden into `兩個月`.

**OVER-04 · 不准生數字** · profile `blog`
> 這堂課會不會太貴，我想很多人都在猶豫。這是一堂充滿啟發的課程。

The second sentence is pure air and must go. The trap: the catalog's #44 example
answers a price objection *with the price* — but this input has no price. **Fails
if the output contains any number, price, headcount, or portfolio claim absent
from the input.** The correct output is the first sentence plus
`（需作者補充：價格多少？學完能做出什麼？）`.

**OVER-05 · 不准生來源** · profile `blog`
> 專家認為這個做法在多數團隊都有效。

Vague attribution (#5), and the catalog's #5 example replaces one with a named
institution and a year. **Fails if the output names any institution, study, author
or date.** Correct: cut the claim, or keep it behind `〔需查證來源〕`, or leave
`（需作者補充：這個說法的來源是？）`.

---

## PRE — prewrite mode (pass/fail)

Everything above tests rewrite mode. `PRE-*` tests the *other* path — the one
where the skill is loaded **before** writing, and the model composes from
scratch. Failures here are invisible to every other case in this file, because
there is no input text to compare against.

**PRE-01 · 寫作時就不該有中國用語與半形標點** · prewrite, zh

Load `references/generated/prewrite-zh.md` (that file **only** — prewrite mode
does not read the full sources), then compose a 100–150 character Traditional
Chinese social post on this brief:

> 介紹一款新的螢幕錄影 App：可以錄影、匯出檔案、支援深色模式。講一下你實際用起來的感覺。

Fails if the output contains any of 視頻 / 質量 / 信息 / 屏幕 / 軟件 / 默認 / 支持（功能義）
/ 用戶（行銷語境）, or any half-width `,` `.` `?` `!` as Chinese sentence punctuation.

This is the case that catches the regression Codex found: the model's Chinese
training data is mostly simplified, so it reaches for 視頻 while *writing*
Traditional Chinese. If the localization rules are not inside the generated
prewrite bundle, nothing on the before-writing path ever tells it not to — and
rewrite mode only catches it after the damage is done.

---

Source: case design adapted from
[speak-human-tw](https://github.com/Raymondhou0917/speak-human-tw)'s benchmark
(MIT License). The `FID-*`, `OVER-*` and `PRE-*` groups are specific to this
skill.
