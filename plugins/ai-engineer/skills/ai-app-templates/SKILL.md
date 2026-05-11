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

Note: `allowed-tools: Read, Glob` reflects what this skill itself needs
(browse the catalog and read referenced files). The file-copy and
scaffolding steps are performed by the calling agent using its own tool
permissions — they do not need to be listed here.

## Related skills

- `ai-engineer:ai-engineering` — broader AI system design and provider tradeoffs.
- `ai-engineer:langgraph` — when the shape needs to become a multi-step graph workflow.
