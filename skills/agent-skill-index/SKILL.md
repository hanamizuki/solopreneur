---
name: agent-skill-index
description: |
  Internal skill index used by platform-specific agents to discover best practice
  skills at runtime. Not intended for direct user invocation — agents Glob for
  the index files in this directory automatically.
---

# Agent Skill Index

This directory contains platform-specific skill routing tables. Agents use Glob
to discover their index file and then read it to find relevant skills.

## Files

- `references/ios.md` — iOS/macOS SwiftUI skill routing table
- `references/android.md` — Android/Kotlin skill routing table
- `references/web.md` — Web/React/Next.js skill routing table
- `references/python.md` — Python/FastAPI skill routing table
- `references/llm.md` — LLM/LangGraph skill routing table
