# Agent Patterns

## Basic tool-calling loop

```python
import json, openai

def run_agent(user_message: str, tools: list, tool_handlers: dict):
    messages = [{"role": "user", "content": user_message}]
    
    while True:
        response = openai.chat.completions.create(
            model="gpt-4o", messages=messages, tools=tools
        )
        msg = response.choices[0].message
        messages.append(msg)

        if not msg.tool_calls:
            return msg.content  # Final answer

        for call in msg.tool_calls:
            fn_name = call.function.name
            fn_args = json.loads(call.function.arguments)
            result = tool_handlers[fn_name](**fn_args)
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result),
            })
```

## Multi-step with max iterations

Always cap iterations to avoid infinite loops:

```python
MAX_ITERATIONS = 10

for i in range(MAX_ITERATIONS):
    response = llm.call(messages, tools)
    if response.stop_reason == "end_turn":
        break
    # handle tool calls...
else:
    raise RuntimeError("Agent exceeded max iterations")
```

## Memory patterns

**Short-term (in-context):** Just the message history. Good for single session.

**Long-term (external store):**
```python
# On each turn: retrieve relevant memories
memories = memory_store.search(query=user_message, limit=3)
system_prompt = f"Relevant context:\n{memories}\n\n{base_system_prompt}"
```

**Episodic memory:** Save summaries of completed tasks:
```python
summary = llm.summarize(conversation_history)
memory_store.save(summary, metadata={"timestamp": now, "task": task_type})
```

## Error handling

```python
try:
    result = tool_handler(**args)
except Exception as e:
    # Return error as tool result — let LLM decide what to do
    result = {"error": str(e), "suggestion": "Try with different parameters"}
```

Never crash the agent on tool failure — let it recover gracefully.

## Structured output (Pydantic)

```python
from pydantic import BaseModel
from openai import OpenAI

class TaskPlan(BaseModel):
    steps: list[str]
    estimated_time: str
    risks: list[str]

client = OpenAI()
response = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Plan this project: ..."}],
    response_format=TaskPlan,
)
plan = response.choices[0].message.parsed
```

## OpenClaw sub-agent delegation

When a task is too big for one context, spawn a sub-agent:

```python
# In OpenClaw: use sessions_spawn with runtime="subagent"
# Pass specific task + relevant context
# Poll for completion or let it push-notify
```

## Cost tracking

```python
# Always log usage
usage = response.usage
cost = (usage.prompt_tokens * 0.005 + usage.completion_tokens * 0.015) / 1000
logger.info(f"Turn cost: ${cost:.4f} | Total: ${running_total:.4f}")
```
