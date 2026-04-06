# LLM Skills Index

When facing an AI Agent / LLM development issue, find the appropriate skill by
description, then use Read to load the corresponding SKILL.md.

## How to Read Skills

Read: `~/.claude/skills/{skill-name}/SKILL.md`

## Skills

### LangGraph
- `langgraph`: LangGraph v1.0 development principles (StateGraph, create_react_agent, Supervisor/Swarm patterns, streaming, interrupts)

### Python Services
- `python-backend-service`: Python long-running service best practices — SDK client lifecycle, connection pool reuse, shutdown cleanup, multi-worker considerations. For FastAPI/Uvicorn/ASGI service review and development.

### AI System Architecture
- `ai-engineer`: AI/ML system construction (RAG pipeline, vector DB selection, tool calling, embeddings, MLOps)

### Prompt Engineering
- `prompt-architect`: Transform vague requirements into structured prompts (CoT, Few-Shot, Persona frameworks), incl. quality checklist
- `senior-prompt-engineer`: Prompt patterns, LLM evaluation, agentic system design, incl. Python analysis tools (prompt_optimizer, rag_evaluator, agent_orchestrator)

### Agent Optimization
- `agent-optimization`: Systematic agent performance improvement (baseline analysis → prompt engineering → A/B test → staged rollout)

## Common Combinations

- Writing new prompts → `prompt-architect`; need quantitative evaluation → `senior-prompt-engineer`
- Building RAG system → `ai-engineer` (architecture) + `langgraph` (workflow) + `prompt-architect` (prompt design)
- Improving existing agent → `agent-optimization` (process) + `senior-prompt-engineer` (eval tools)
- Reviewing FastAPI/LangGraph service → `python-backend-service` (resource lifecycle) + `langgraph` (graph patterns)
- Adding SDK integration to existing service → `python-backend-service` (client singleton, shutdown cleanup)
