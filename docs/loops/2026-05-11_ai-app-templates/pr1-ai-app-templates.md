# feat(ai-engineer): add ai-app-templates skill with simple-llm-api

## Requirements

Add an **umbrella skill** `ai-app-templates` to the `ai-engineer` plugin,
mirroring the structure of `ios-app-templates` in `ios-dev`. Ship one
reference implementation under the umbrella: `simple-llm-api`.

`simple-llm-api` is a minimal FastAPI service with these properties:

- Single endpoint `POST /chat` accepting `{prompt: str, model?: str}`,
  returning `{text: str, model: str}`.
- One `GET /health` returning `{ok: true}`.
- Three provider client files (`anthropic_client.py`, `gemini_client.py`,
  `openrouter_client.py`) sitting side-by-side under `app/providers/`,
  each exporting `DEFAULT_MODEL: str` and
  `complete(messages: list[dict], model: str | None = None) -> str`.
- `main.py` picks one provider via a single import line; OpenRouter is
  the default.
- `main.py` wraps the endpoint's `{prompt}` into a single-element
  `messages` array before calling `llm.complete()`.
- Python + FastAPI + uv (no Docker, no auth, no streaming, no tests).
- README documents the consumption workflow: agent reads README → asks
  user which provider → copies tree → edits one import line → deletes
  the two unused provider files.

**Authoritative source**: read `docs/spec/2026-05-11-ai-app-templates.md`
in the repo root for full design details, code shapes, file contents,
and rationale. Treat that spec as the single source of truth — this PR
spec is a pointer + acceptance criteria.

## Files to Read

Read in this order before planning:

1. **`docs/spec/2026-05-11-ai-app-templates.md`** — full design with code
   snippets for every file. **This is the source of truth.**
2. `plugins/ios-dev/skills/ios-app-templates/SKILL.md` — for reference,
   if it exists on `main`. If not, look in
   `.claude/worktrees/feature+ios-app-templates/plugins/ios-dev/skills/ios-app-templates/SKILL.md`
   to see the pattern this umbrella skill mirrors.
3. `plugins/ai-engineer/skills/langgraph/SKILL.md` — for sibling skill
   tone, frontmatter style, related-skills section.
4. `plugins/ai-engineer/.claude-plugin/plugin.json` — confirms plugin
   metadata (no need to bump version here; release flow handles that).

## Files to Create

All under `plugins/ai-engineer/skills/ai-app-templates/`:

- `SKILL.md` — frontmatter (name, description, allowed-tools) + catalog
  + workflow + related-skills. Description triggers on both Chinese and
  English phrases. See spec §SKILL.md.
- `references/simple-llm-api/README.md` — eight sections per the design
  doc's §README outline (What this template does, Quickstart, Architecture,
  Provider choice, Provider notes, Workflow for the consuming agent,
  Extension points, Version notes).
- `references/simple-llm-api/pyproject.toml` — Python ≥ 3.11, deps:
  fastapi, uvicorn[standard], pydantic, python-dotenv, anthropic,
  google-genai, openai.
- `references/simple-llm-api/.env.example` — three commented provider
  key lines, no default uncomment.
- `references/simple-llm-api/.gitignore` — `.env`, `.venv/`,
  `__pycache__/`, `*.pyc`.
- `references/simple-llm-api/app/__init__.py` — empty.
- `references/simple-llm-api/app/main.py` — FastAPI app, `ChatRequest`,
  `ChatResponse`, `/health`, `/chat`. Default import:
  `from app.providers import openrouter_client as llm`.
- `references/simple-llm-api/app/providers/__init__.py` — empty.
- `references/simple-llm-api/app/providers/anthropic_client.py`
- `references/simple-llm-api/app/providers/gemini_client.py`
- `references/simple-llm-api/app/providers/openrouter_client.py`

## Critical Implementation Steps

**Before writing the three provider files, query context7** for the
current API surfaces (the design doc flags this as Implementation Order
step 6, but it must happen during Plan Mode, not after):

- `mcp__plugin_context7_context7__resolve-library-id` then `query-docs`
  for: `anthropic` (Python SDK), `google-genai` (Python SDK), `openai`
  (Python SDK, used here as the OpenRouter client via `base_url`).
- Confirm:
  - Anthropic: `Anthropic(api_key=...)`, `client.messages.create(...)`,
    `response.content[0].text` access pattern, `max_tokens` requirement.
  - Google GenAI: client instantiation, `client.models.generate_content(...)`,
    `contents` shape (`role` + `parts: [{"text": ...}]`),
    `system_instruction` location (top-level vs. inside `config`).
  - OpenAI: `OpenAI(api_key=..., base_url=...)`,
    `client.chat.completions.create(...)`,
    `response.choices[0].message.content` access.
- Confirm current latest model strings:
  - Anthropic Claude Sonnet (Q2 2026)
  - Google Gemini 2.5 Flash
  - OpenRouter format for Anthropic Sonnet

If context7 returns SDK shapes that differ from the design doc's code
snippets, **the SDK reality wins** — update the implementation and note
the deviation in the PR description.

## Acceptance Criteria

The PR is acceptable when **all** of the following hold:

- [ ] `plugins/ai-engineer/skills/ai-app-templates/SKILL.md` exists with
      valid frontmatter (name, description, allowed-tools).
- [ ] All 10 files under `references/simple-llm-api/` exist (see Files
      to Create).
- [ ] In a temporary scratch directory:
      `cp -r plugins/ai-engineer/skills/ai-app-templates/references/simple-llm-api /tmp/sl-api-test`,
      then `cd /tmp/sl-api-test && uv sync` succeeds with Python ≥ 3.11.
- [ ] `uv run python -c "from app.main import app; print(app.title)"`
      prints `Simple LLM API` (proves all imports resolve, no syntax
      errors).
- [ ] `uv run python -c "from app.providers import anthropic_client, gemini_client, openrouter_client; print('ok')"`
      prints `ok` with no `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` /
      `OPENROUTER_API_KEY` set — this means client init must be **lazy**
      OR wrapped so that import alone doesn't read env. Adjust the code
      to do lazy init if needed (e.g. read env inside `complete()`
      rather than at module top). **This is a hard requirement** because
      the template gets imported during scaffolding before keys are set.
- [ ] `uv run uvicorn app.main:app --port 18234` (an unusual port to
      avoid collisions) starts the server. Then
      `curl -sS -X POST http://localhost:18234/chat -H 'content-type: application/json' -d '{"prompt":""}'`
      returns HTTP 400 with `{"detail":"prompt must not be empty"}`.
      Kill the server after.
- [ ] `curl -sS http://localhost:18234/health` returns `{"ok":true}`.
- [ ] No `print()` debug statements left in any file.
- [ ] README's "Workflow for the consuming agent" section explicitly
      lists the four manual steps (ask user → copy → edit import → delete
      two providers).
- [ ] Tag-check: nothing in any file references `langgraph`, `langchain`,
      or `LangSmith` (the template is deliberately not langgraph-based).

## Notes

- **Lazy env reading is non-negotiable** — if `_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])` runs at module-import time, the template breaks the moment the consuming agent imports it without setting all three keys. Restructure so env is read inside `complete()`, or guard the client creation with a `functools.lru_cache`-wrapped helper. The design doc shows module-level init for readability; reality requires lazy. Note this divergence in the README's "Provider notes" section.
- The provider clients are written for **readability over abstraction** — no shared base class, no protocol. Three independent files. Resist the urge to factor.
- **Smoke testing against real LLM APIs is out of scope** for this PR — needs paid keys + flaky network. The acceptance criteria above all run offline.
- Do **not** add tests, Docker, CI workflows, auth, CORS, logging
  middleware, or streaming. The README's "Extension points" section
  describes these as future additions; the template must not ship them.
- The skill's `description` field in `SKILL.md` must be on the broader
  side (any "AI backend" or "LLM API" task should trigger it), since
  the catalog inside the umbrella does the second-level routing.
- `pyproject.toml` should NOT pin SDK versions tightly — use `>=` with
  the minimum versions confirmed via context7 to be compatible with
  the code as written.
- README is in English (this repo is MIT-licensed open source).
- After all files are written, run `git diff --stat` and confirm
  exactly 11 new files in `plugins/ai-engineer/skills/ai-app-templates/`
  and nothing else.
