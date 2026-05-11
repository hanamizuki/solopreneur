# `ai-app-templates` skill — design spec

> 2026-05-11

Add an umbrella skill to `ai-engineer` plugin, mirroring `ios-app-templates`
in `ios-dev`. The umbrella carries reference implementations of common AI
backend shapes. First entry is `simple-llm-api` — a minimal FastAPI service
exposing `POST /chat` that calls Anthropic, Gemini, or OpenRouter (one
picked per project).

Source inspiration: `/Users/Hana/Backup/Developer/como-langgraph`. We borrow
the FastAPI + Pydantic + env-driven structure but drop LangGraph (this
template is for the simplest LLM-call shape, not graph workflows).

## Goal

When the user says "建立一個 LLM API", "做個 chat endpoint with OpenRouter",
"FastAPI + Claude", or similar, the `ai-engineer` agent loads this skill,
finds `simple-llm-api` in the catalog, reads its README, and scaffolds a
runnable backend in one round.

## Why umbrella, not one skill per template

Same reasoning as `ios-app-templates`:

- Skill count stays constant (always 1 × `ai-app-templates`)
- Adding templates = adding a subdirectory under `references/`
- Agent reads the catalog and sees adjacent templates (RAG, streaming
  chat, agent loop, etc. — future entries)

Trade-off: description triggers broadly (any "AI backend" topic). Acceptable
— the agent reads the catalog and decides if the umbrella is relevant.

## Skill placement

```
plugins/ai-engineer/skills/ai-app-templates/
├── SKILL.md
└── references/
    └── simple-llm-api/
        ├── README.md
        ├── pyproject.toml
        ├── .env.example
        ├── .gitignore
        └── app/
            ├── __init__.py
            ├── main.py
            └── providers/
                ├── __init__.py
                ├── anthropic_client.py
                ├── gemini_client.py
                └── openrouter_client.py
```

## `SKILL.md`

```yaml
---
name: ai-app-templates
description: Use when starting a new AI backend service or LLM-powered API —
  provides reference implementations for common shapes (simple LLM endpoint;
  future: RAG, streaming chat, agent loop). Triggers on phrases like
  "建立 LLM API", "做個 chat endpoint", "AI 後端範本", "LLM 範本",
  "simple LLM API", "OpenRouter / Gemini / Claude endpoint",
  "FastAPI + LLM".
allowed-tools: Read, Glob
---
```

Body (English; this repo is MIT-licensed open source):

```markdown
# AI App Templates

When starting a new AI backend, check the catalog first for a matching shape.

## Catalog

| Template | Use when |
|---|---|
| simple-llm-api | Minimal FastAPI service with one `POST /chat` endpoint. Single prompt in, plain text out. Provider is chosen at scaffold time (Anthropic / Gemini / OpenRouter). |

→ Read `references/<template>/README.md` for architecture and the consumption
workflow, then copy files from `references/<template>/` into the new project.

## Workflow

1. Find a matching template in the catalog above.
2. Read the template's `README.md` (architecture, provider choice, version notes).
3. Follow the template's own workflow section (it will tell the agent what
   to ask the user, what to copy, and what to edit).

## Related skills

- `ai-engineer:ai-engineering` — broader AI system design and provider tradeoffs.
- `ai-engineer:langgraph` — when the shape needs to become a multi-step graph workflow.
```

## `simple-llm-api/` design

### Endpoint contract

```
POST /chat
Content-Type: application/json
Body: { "prompt": "...", "model": "..." (optional) }
→ 200: { "text": "...", "model": "..." }
→ 400: { "detail": "prompt must not be empty" }
→ 502: { "detail": "upstream LLM error: <msg>" }

GET /health
→ 200: { "ok": true }
```

`prompt` is a single plain string. `model` is optional — when omitted, the
endpoint uses the provider's `DEFAULT_MODEL`. The response echoes the
`model` actually used so clients can confirm.

### Provider client interface (signature B — messages array, layered wrap)

Each provider file exports exactly two names:

```python
DEFAULT_MODEL: str
def complete(messages: list[dict], model: str | None = None) -> str
```

Rationale: `messages` is the canonical shape across Anthropic, OpenAI, and
OpenRouter APIs. Even though the endpoint accepts a single `prompt`, the
provider layer stays in canonical form so future extensions (system prompt,
multi-turn) only touch `main.py`'s wrap line, not the provider code.

`main.py` wraps the endpoint's `prompt` field:

```python
messages = [{"role": "user", "content": req.prompt}]
text = llm.complete(messages, model=req.model or llm.DEFAULT_MODEL)
```

### Per-provider files

Each file is self-contained: env read, client init, `DEFAULT_MODEL`, and
`complete()`. No shared base class, no protocol — three files are
independent and the unused two are deleted at scaffold time.

#### `anthropic_client.py`

```python
import os
from anthropic import Anthropic

_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
DEFAULT_MODEL = "claude-sonnet-4-6"  # locked 2026-05-11

def complete(messages: list[dict], model: str | None = None) -> str:
    response = _client.messages.create(
        model=model or DEFAULT_MODEL,
        max_tokens=4096,
        messages=messages,
    )
    return response.content[0].text
```

#### `gemini_client.py`

```python
import os
from google import genai

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
DEFAULT_MODEL = "gemini-2.5-flash"  # locked 2026-05-11

def _to_gemini(messages: list[dict]) -> tuple[str | None, list[dict]]:
    """Map OpenAI-style messages to Gemini's role + system_instruction shape.

    Gemini uses role values 'user' / 'model' (no 'assistant', no 'system' inline).
    System prompts go to a separate system_instruction field.
    """
    system: str | None = None
    contents: list[dict] = []
    for m in messages:
        role = m["role"]
        text = m["content"]
        if role == "system":
            system = text
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": text}]})
        else:
            contents.append({"role": "user", "parts": [{"text": text}]})
    return system, contents

def complete(messages: list[dict], model: str | None = None) -> str:
    system, contents = _to_gemini(messages)
    response = _client.models.generate_content(
        model=model or DEFAULT_MODEL,
        contents=contents,
        config={"system_instruction": system} if system else None,
    )
    return response.text
```

> Implementation note: verify `google-genai` SDK shape with context7 before
> finalising — the API surface has changed several times in 2025-2026.

#### `openrouter_client.py`

```python
import os
from openai import OpenAI

_client = OpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)
DEFAULT_MODEL = "anthropic/claude-sonnet-4-6"  # locked 2026-05-11

def complete(messages: list[dict], model: str | None = None) -> str:
    response = _client.chat.completions.create(
        model=model or DEFAULT_MODEL,
        messages=messages,
    )
    return response.choices[0].message.content
```

### `app/main.py`

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.providers import openrouter_client as llm
# ↑↑↑ Provider selection point. Change to anthropic_client or gemini_client to switch.

app = FastAPI(title="Simple LLM API")


class ChatRequest(BaseModel):
    prompt: str
    model: str | None = None


class ChatResponse(BaseModel):
    text: str
    model: str


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt must not be empty")
    model = req.model or llm.DEFAULT_MODEL
    messages = [{"role": "user", "content": req.prompt}]
    try:
        text = llm.complete(messages, model=model)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"upstream LLM error: {e}")
    return ChatResponse(text=text, model=model)
```

OpenRouter is the default `from ... import` because it has the lowest setup
friction (works with free models, single key covers most upstreams).

### `pyproject.toml`

```toml
[project]
name = "simple-llm-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "python-dotenv>=1.0",
    "anthropic>=0.40",
    "google-genai>=0.3",
    "openai>=1.50",
]
```

All three SDKs are listed. After the agent picks one provider, it
optionally runs `uv remove` on the other two. Keeping all three doesn't
break anything — only the imported one is loaded at runtime.

### `.env.example`

```bash
# Pick ONE provider's key and uncomment.

# Anthropic — direct Claude API
# ANTHROPIC_API_KEY=sk-ant-...

# Google — Gemini API
# GEMINI_API_KEY=...

# OpenRouter — unified gateway (covers Anthropic / Google / OSS models)
# OPENROUTER_API_KEY=sk-or-v1-...
```

### `.gitignore`

```
.env
.venv/
__pycache__/
*.pyc
```

### `README.md` outline

English, full content written during implementation:

1. **What this template does** — one paragraph: FastAPI single endpoint,
   pluggable LLM provider, no auth, no streaming, no persistence.
2. **Quickstart**
   - `uv sync`
   - `cp .env.example .env`, fill in the chosen provider's key
   - `uv run uvicorn app.main:app --reload`
   - `curl -X POST localhost:8000/chat -H 'content-type: application/json' -d '{"prompt":"hi"}'`
3. **Architecture** — `main.py` ↔ `providers/<one>.py`, single layer
4. **Provider choice table**

   | Provider | Env key | SDK | Default model | Notes |
   |---|---|---|---|---|
   | Anthropic | `ANTHROPIC_API_KEY` | `anthropic` | `claude-sonnet-4-6` | Native Claude API; requires `max_tokens` |
   | Gemini | `GEMINI_API_KEY` | `google-genai` | `gemini-2.5-flash` | role mapping (`assistant` → `model`); `system` → `system_instruction` |
   | OpenRouter | `OPENROUTER_API_KEY` | `openai` (OpenAI-compat) | `anthropic/claude-sonnet-4-6` | Single key routes to many upstreams |

5. **Provider notes** — why the Gemini file has a `_to_gemini` adapter;
   why OpenRouter uses the OpenAI SDK; sourcing keys from anthropic.com /
   ai.google.dev / openrouter.ai
6. **Workflow for the consuming agent** (this section is the script the
   `ai-engineer` agent follows when scaffolding):
   ```
   1. Read this README.
   2. Ask user: "Which LLM provider do you want to wire up? (anthropic / gemini / openrouter)"
   3. Copy the entire references/simple-llm-api/ tree into the new project root.
   4. In app/main.py, edit the import line to:
        from app.providers import <chosen>_client as llm
   5. Delete the two unused providers/<other>_client.py files.
   6. Optional: `uv remove anthropic google-genai openai` for the SDKs no
      longer used.
   7. Smoke test:
        uv sync
        cp .env.example .env  # fill the chosen key
        uv run uvicorn app.main:app --reload
        curl -X POST localhost:8000/chat -H 'content-type: application/json' \
          -d '{"prompt":"hi"}'
   ```
7. **Extension points** — how to add: streaming, system prompt, multi-turn
   history, auth, CORS, Docker. Each gets a one-paragraph hint pointing at
   the file to edit. No code provided — this template stays minimal.
8. **Version notes** — `DEFAULT_MODEL` strings and SDK pins locked on
   2026-05-11. If today is more than 6 months later, re-check provider
   docs for current default models.

## Out of scope (explicit)

- Auth (`X-API-Key`, JWT, OAuth)
- CORS, rate limit, request logging middleware, lifespan hooks
- Streaming (SSE), tool calling, function calling
- Multi-turn conversation, history persistence (DB / file / Redis)
- Docker, docker-compose, GitHub Actions, deploy scripts
- Tracing (LangSmith, Phoenix, Langfuse), token counting, cost tracking
- Tests (no `pytest` suite). README has a `curl` smoke test instead.

These are listed in `README.md` as "Extension points" so the consuming
agent knows where to grow the template, without the template itself
shipping the code.

## Implementation order

1. Skill skeleton: `SKILL.md` + empty `references/simple-llm-api/` tree
2. `pyproject.toml`, `.env.example`, `.gitignore`
3. Three provider files
4. `app/__init__.py`, `app/main.py`
5. `README.md` with full content
6. **Verify with context7**: latest `anthropic`, `google-genai`, `openai`
   SDK API shapes; current default model strings for each provider
7. Local smoke test: run `uv sync`, set each provider's key in turn, hit
   `/chat`, confirm a non-empty response from all three
8. Final SKILL.md polish (catalog row wording, trigger phrase tuning)
9. Commit and open PR

## Validation criteria

- `uv sync` succeeds with Python ≥ 3.11
- `uv run uvicorn app.main:app --reload` starts without import errors
- `curl POST /chat` with valid env returns 200 + non-empty `text` for all
  three providers
- `curl POST /chat` with empty `prompt` returns 400
- `curl POST /chat` with bad / missing key returns 502
- `GET /health` returns `{"ok": true}`

## Risks and mitigations

- **SDK drift** — `google-genai` and `anthropic` SDK surfaces have changed
  in 2025-2026. Mitigation: step 6 of implementation order runs
  context7 lookups before finalising code.
- **Model string staleness** — `claude-sonnet-4-6` / `gemini-2.5-flash`
  may be retired or renamed within months. Mitigation: README version
  note + locked date.
- **Provider mapping bugs (Gemini)** — `_to_gemini` adapter has the most
  surface area for subtle bugs (missing role, missing parts field).
  Mitigation: smoke test step 7 covers a system-prompt and multi-turn
  case even though the endpoint doesn't expose them, to confirm the
  adapter works under future extension.

## Not in this spec

- A second template entry (RAG, streaming, agent). The umbrella supports
  more entries trivially — just add a subdir under `references/` — but
  this spec scopes only `simple-llm-api`.
- Migration of the `ai-engineering` or `langgraph` skills' content into
  templates. Those stay as reference / guidance skills; this umbrella is
  for scaffoldable code.
