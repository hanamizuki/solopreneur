# simple-llm-api

A reference template for the simplest useful LLM backend shape: a FastAPI
service with one `POST /chat` endpoint that forwards a prompt to a single
provider (Anthropic, Gemini, or OpenRouter) and returns the reply.

## What this template does

One FastAPI app, one endpoint, one provider. No auth, no streaming, no
persistence, no tracing. The provider is pluggable but only one is wired
at a time — pick at scaffold time, delete the other two provider files,
and you're left with the minimal surface needed to serve LLM completions
over HTTP.

## Quickstart

```bash
uv sync
cp .env.example .env       # uncomment ONE provider key line and fill it
uv run uvicorn app.main:app --reload

curl -X POST http://localhost:8000/chat \
  -H 'content-type: application/json' \
  -d '{"prompt": "hi"}'
```

Health check:

```bash
curl http://localhost:8000/health
# → {"ok": true}
```

## Architecture

```text
app/
├── main.py                  # FastAPI app, ChatRequest/Response, /health, /chat
└── providers/
    ├── anthropic_client.py  # one file per provider, fully self-contained
    ├── gemini_client.py
    └── openrouter_client.py
```

Two layers, no abstractions:

- `main.py` owns HTTP, validation, error mapping. It picks a provider via
  a single import line: `from app.providers import <name>_client as llm`.
- Each provider file exports `DEFAULT_MODEL: str` and
  `complete(messages: list[dict], model: str | None = None) -> str`.

The endpoint accepts a single `prompt` string but wraps it into the
canonical `messages` array shape before calling the provider. This means
future extensions (system prompt, multi-turn history) only touch the wrap
line in `main.py` — provider clients stay in canonical form.

## Provider choice

| Provider | Env key | SDK | Default model | Notes |
|---|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` | `claude-sonnet-4-6` | Native Claude API; requires `max_tokens` on every call |
| Gemini | `GEMINI_API_KEY` | `google-genai` | `gemini-2.5-flash` | Role mapping (`assistant` → `model`); `system` goes to a separate `system_instruction` field |
| OpenRouter | `OPENROUTER_API_KEY` | `openai` (OpenAI-compat) | `anthropic/claude-sonnet-4.6` | One key routes to many upstreams (Anthropic, Google, OSS) |

OpenRouter is the default because it has the lowest setup friction.

## Provider notes

**Why the Gemini file has a `_to_gemini` adapter.** Gemini uses
`role: "user" / "model"` (no `assistant`), wraps text inside
`parts: [{"text": ...}]`, and routes system prompts through a separate
`system_instruction` config field. The adapter maps the canonical
OpenAI-style messages array into Gemini's native shape so callers stay
provider-agnostic.

**Why OpenRouter uses the OpenAI SDK.** OpenRouter exposes an
OpenAI-compatible REST surface. Pointing the `openai` Python SDK at
`https://openrouter.ai/api/v1` gives you a battle-tested client without
maintaining a separate one. The trade-off: model strings use OpenRouter's
`<provider>/<model>` format (e.g. `anthropic/claude-sonnet-4-6`), not the
upstream's native ID.

**Lazy client initialisation.** Each provider's `Anthropic(...)`,
`genai.Client(...)`, `OpenAI(...)` instance is created inside a
`functools.lru_cache`-wrapped `_client()` helper, not at module top.
This means `from app.providers import anthropic_client` does **not**
raise `KeyError: 'ANTHROPIC_API_KEY'` — env is only read when
`complete()` actually runs. Scaffolding agents can import the template
before `.env` is populated; CI smoke tests that only need
`/health` work without any provider keys.

**Where to get keys.**

- Anthropic — <https://console.anthropic.com/settings/keys>
- Gemini — <https://aistudio.google.com/apikey>
- OpenRouter — <https://openrouter.ai/keys>

## Workflow for the consuming agent

When an agent uses this template to scaffold a new project, it follows
these four manual steps:

1. **Ask the user** which LLM provider to wire up (anthropic / gemini /
   openrouter).
2. **Copy** the entire `references/simple-llm-api/` tree into the new
   project root.
3. **Edit** `app/main.py` — change the import line to:
   ```python
   from app.providers import <chosen>_client as llm
   ```
4. **Delete** the two unused `app/providers/<other>_client.py` files.

Optional follow-ups:

- `uv remove anthropic google-genai openai` to drop the two unused SDKs.
- Set up `.env` with the chosen provider's key.
- Smoke test:
  ```bash
  uv sync
  uv run uvicorn app.main:app --reload
  curl -X POST localhost:8000/chat -H 'content-type: application/json' \
    -d '{"prompt": "hi"}'
  ```

## Extension points

Each row below is a deliberate omission. The template stays minimal; grow
it by editing the file in the **edit** column.

| Want to add | Edit | Hint |
|---|---|---|
| Streaming (SSE) | `app/main.py` | Replace `chat()` with an async generator returning `StreamingResponse`; switch provider call to the SDK's stream API |
| System prompt | `app/main.py` | Prepend `{"role": "system", "content": "..."}` to `messages` before `llm.complete(...)` |
| Multi-turn history | `app/main.py` + `ChatRequest` | Add `history: list[dict] = []` to `ChatRequest`; concatenate with the new user turn before calling `complete()` |
| Auth | `app/main.py` | Add a FastAPI `Depends(...)` that checks `X-API-Key` header or a JWT bearer |
| CORS | `app/main.py` | `app.add_middleware(CORSMiddleware, ...)` |
| Docker | new `Dockerfile` | `FROM python:3.11-slim`, install uv, `uv sync --no-dev`, `CMD uvicorn app.main:app --host 0.0.0.0` |
| Tracing | `app/providers/<name>_client.py` | Wrap `complete()` in a Phoenix or Langfuse span; or use the SDK's built-in instrumentation |
| Tests | new `tests/` | Use `httpx.AsyncClient` against `app.main:app`; mock `llm.complete` to avoid real API calls |

## Version notes

`DEFAULT_MODEL` strings and SDK minimum versions were locked on
**2026-05-11**. If today is more than 6 months later:

- Re-check each provider's docs for the current generally-available model
  ID and update `DEFAULT_MODEL` in the relevant `providers/*_client.py`.
- Re-check `pyproject.toml` SDK pins against the SDKs' release notes —
  the `>=` lower bounds may have skewed if the SDK introduced breaking
  changes since.

Provider doc roots:

- Anthropic — <https://docs.anthropic.com/en/api/messages>
- Gemini — <https://ai.google.dev/gemini-api/docs>
- OpenRouter — <https://openrouter.ai/docs>
