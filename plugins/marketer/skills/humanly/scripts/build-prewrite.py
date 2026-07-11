#!/usr/bin/env python3
"""Build generated/prewrite-{zh,en}.md from the humanly source files.

The prewrite files are what the humanly skill's prewrite mode loads before
writing. They are DERIVED artifacts — never edit them by hand. This script
extracts, per language:

  1. the principles chapters of patterns-{lang}.md (core rules, personality
     and soul, formatting/rhythm check),
  2. the full text of every pattern whose summary line carries a
     "prewrite" flag (the patterns writers most often commit),
  3. the Tier 1 section — and, for zh, the banned-sentence-patterns
     section — of word-table-{lang}.md,
  4. an appendix index of ALL patterns (number + title + one-line summary).

It also validates the sources: every pattern must have a summary line,
numbering must be contiguous, and every configured section heading must
exist — a broken format fails the build instead of silently producing a
bad file.

Usage:
    python3 build-prewrite.py           # regenerate both languages
    python3 build-prewrite.py --check   # exit 1 if generated files are stale
"""

import argparse
import re
import sys
from pathlib import Path
from typing import NoReturn

SKILL_DIR = Path(__file__).resolve().parent.parent
REFERENCES = SKILL_DIR / "references"

PATTERN_RE = re.compile(r"^### (\d+)\.\s*(.+?)\s*$")
SUMMARY_RE = re.compile(r"^(?:摘要：|Summary:)\s*(.+?)\s*$")
# Summary lines end with an optional flag list, e.g. "…｜prewrite" (zh,
# fullwidth bar) or "… | prewrite" (en, ASCII bar).
FLAG_SPLIT_RE = re.compile(r"[｜|]")
# The only recognized trailing flag. Anything after a bar that is NOT in this
# set is treated as summary prose, so an ASCII "|" written inside an EN summary
# survives instead of silently truncating the visible summary at the first bar.
KNOWN_FLAGS = {"prewrite"}

CONFIGS = {
    "zh": {
        "patterns": "patterns-zh.md",
        "word_table": "word-table-zh.md",
        "out": "generated/prewrite-zh.md",
        "principles_start": "## 核心規則",
        "principles_end": "## 內容模式",
        "word_sections": ["## Tier 1 — 必換", "## 禁用句型 — 看到就刪"],
        "title": "# 中文寫作 Prewrite（寫作前必讀）",
        "intro": (
            "寫作前讀完這一份就好。原則與範例用來內化語感，詞表與句型看到就避開。"
            "完整 pattern 目錄（rewrite / review 時載入）在 `../patterns-zh.md`。"
        ),
        "picked_heading": "## 寫作時最常犯的 Pattern（含範例）",
        "appendix_heading": "## 附錄：全部 pattern 一句話索引",
        "appendix_note": "完整定義與 before/after 範例見 `../patterns-zh.md`。",
    },
    "en": {
        "patterns": "patterns-en.md",
        "word_table": "word-table-en.md",
        "out": "generated/prewrite-en.md",
        "principles_start": "## Core Rules",
        "principles_end": "## Content Patterns",
        "word_sections": ["## Tier 1 — Always Replace"],
        "title": "# English Prewrite (read before writing)",
        "intro": (
            "Read this one file before writing. The principles and examples are "
            "for internalizing; the word table lists traps to avoid on sight. "
            "The full pattern catalog (loaded during rewrite / review) lives in "
            "`../patterns-en.md`."
        ),
        "picked_heading": "## Patterns Writers Most Often Commit (with examples)",
        "appendix_heading": "## Appendix: one-line index of all patterns",
        "appendix_note": "Full definitions and before/after examples: `../patterns-en.md`.",
    },
}

BANNER = (
    "<!-- AUTO-GENERATED — DO NOT EDIT.\n"
    "     Sources: ../{patterns} + ../{word_table}\n"
    "     Regenerate: python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py -->\n"
)

# Sources live in references/; the generated files live in references/generated/.
# A bare `sibling.md` link copied out of a source would resolve against
# references/generated/ and point at nothing, so re-anchor it one level up.
# The lookahead keeps this idempotent and leaves already-relative links
# (`../patterns-zh.md`, written by this script's own intro/appendix) alone.
SIBLING_LINK_RE = re.compile(r"`(?!\.\./)([A-Za-z0-9_-]+\.md)`")


def reanchor_links(text):
    return SIBLING_LINK_RE.sub(r"`../\1`", text)


def fail(msg) -> NoReturn:
    print(f"build-prewrite: ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def rstrip_block(block):
    """Drop trailing blank lines and horizontal rules so joins stay clean."""
    while block and block[-1].strip() in ("", "---"):
        block.pop()
    return block


def find_heading(lines, heading, start=0):
    """Index of the first line matching heading at or after start, else -1.

    Both sides are compared stripped. An exact lines.index() would reject a
    source heading that carries stray trailing whitespace and fail the build
    with a confusing "heading not found" even though the heading is visibly
    present; stripping keeps invisible whitespace from breaking the build.
    """
    target = heading.strip()
    for i in range(start, len(lines)):
        if lines[i].strip() == target:
            return i
    return -1


def extract_block(lines, start_heading, end_heading, source):
    """Return the lines from start_heading (inclusive) to end_heading (exclusive)."""
    start = find_heading(lines, start_heading)
    if start < 0:
        fail(f"{source}: heading not found: {start_heading!r}")
    end = find_heading(lines, end_heading, start)
    if end < 0:
        fail(f"{source}: heading not found after {start_heading!r}: {end_heading!r}")
    return rstrip_block(lines[start:end])


def extract_section(lines, heading, source):
    """Return the lines of one `## ` section, heading included."""
    start = find_heading(lines, heading)
    if start < 0:
        fail(f"{source}: heading not found: {heading!r}")
    end = start + 1
    while end < len(lines) and not lines[end].startswith("## "):
        end += 1
    return rstrip_block(lines[start:end])


def parse_patterns(path):
    """Parse pattern entries: number, title, summary, prewrite flag, body lines."""
    if not path.exists():
        fail(f"source file not found: {path}")
    # utf-8-sig strips a leading BOM if a source was saved with one (identical
    # to utf-8 otherwise), so a BOM can't sneak an invisible ﻿ onto the
    # first line and break heading matching.
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    entries = []
    current = None
    for line in lines:
        m = PATTERN_RE.match(line)
        if m:
            if current:
                entries.append(current)
            current = {
                "num": int(m.group(1)),
                "title": m.group(2),
                "summary": None,
                "pre_write": False,
                "body": [],
            }
            continue
        if current is None:
            continue
        # Any `## ` heading (sub-category divider, Full Example, Reference)
        # closes the current entry; the next `### N.` starts a fresh one.
        if line.startswith("## "):
            entries.append(current)
            current = None
            continue
        sm = SUMMARY_RE.match(line)
        if sm and current["summary"] is None:
            # Peel only trailing parts that are KNOWN flags; rejoin the rest as
            # the summary. An ASCII "|" in EN prose thus survives instead of
            # truncating the summary at the first bar. Flag matching is
            # case-insensitive so a "Prewrite"/"PREWRITE" typo still counts,
            # while the summary keeps the original casing of its non-flag parts.
            parts = [p.strip() for p in FLAG_SPLIT_RE.split(sm.group(1))]
            flags = set()
            while len(parts) > 1 and parts[-1].lower() in KNOWN_FLAGS:
                flags.add(parts.pop().lower())
            current["summary"] = " | ".join(parts)
            current["pre_write"] = "prewrite" in flags
            continue  # the summary line itself stays out of the body
        current["body"].append(line)
    if current:
        entries.append(current)

    missing = [e["num"] for e in entries if not e["summary"]]
    if missing:
        fail(f"{path.name}: patterns missing a summary line: {missing}")
    nums = [e["num"] for e in entries]
    expected = list(range(1, len(entries) + 1))
    if nums != expected:
        fail(f"{path.name}: pattern numbering not contiguous: {nums}")
    return lines, entries


def render_entry(entry):
    body = list(entry["body"])
    while body and body[0].strip() == "":
        body.pop(0)
    rstrip_block(body)
    return [f"### {entry['num']}. {entry['title']}", ""] + body


def build(lang):
    cfg = CONFIGS[lang]
    patterns_path = REFERENCES / cfg["patterns"]
    word_path = REFERENCES / cfg["word_table"]

    pattern_lines, entries = parse_patterns(patterns_path)
    principles = extract_block(
        pattern_lines, cfg["principles_start"], cfg["principles_end"], cfg["patterns"]
    )
    if not word_path.exists():
        fail(f"source file not found: {word_path}")
    word_lines = word_path.read_text(encoding="utf-8-sig").splitlines()
    word_blocks = [
        extract_section(word_lines, h, cfg["word_table"]) for h in cfg["word_sections"]
    ]

    picked = [e for e in entries if e["pre_write"]]
    if not picked:
        fail(f"{cfg['patterns']}: no pattern carries a prewrite flag")

    out = [BANNER.format(patterns=cfg["patterns"], word_table=cfg["word_table"])]
    out.append(cfg["title"])
    out.append("")
    out.append(cfg["intro"])
    out.append("")
    out.extend(principles)
    out.append("")
    out.append("---")
    out.append("")
    out.append(cfg["picked_heading"])
    for entry in picked:
        out.append("")
        out.extend(render_entry(entry))
    out.append("")
    out.append("---")
    for block in word_blocks:
        out.append("")
        out.extend(block)
        out.append("")
        out.append("---")
    out.append("")
    out.append(cfg["appendix_heading"])
    out.append("")
    out.append(cfg["appendix_note"])
    out.append("")
    for entry in entries:
        out.append(f"- #{entry['num']} {entry['title']} — {entry['summary']}")
    out.append("")
    return reanchor_links("\n".join(out)), len(entries), len(picked)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build generated/prewrite-{zh,en}.md from the humanly sources."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if the generated files are stale instead of writing them",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    # Build every language first. build() aborts via fail() on any validation
    # error, so a failure in a later language can never leave an earlier one's
    # file already written — the multi-language write is all-or-nothing.
    built = []
    for lang in CONFIGS:
        content, total, picked = build(lang)
        built.append((lang, content, total, picked))

    stale = []
    for lang, content, total, picked in built:
        out_path = REFERENCES / CONFIGS[lang]["out"]
        if args.check:
            existing = out_path.read_text(encoding="utf-8") if out_path.exists() else None
            if existing != content:
                stale.append(out_path)
            else:
                print(f"OK {out_path.relative_to(SKILL_DIR)} ({total} patterns, {picked} prewrite)")
        else:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(content, encoding="utf-8")
            print(f"wrote {out_path.relative_to(SKILL_DIR)} ({total} patterns, {picked} prewrite)")
    if stale:
        for p in stale:
            print(f"build-prewrite: STALE: {p.relative_to(SKILL_DIR)} — rerun this script", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
