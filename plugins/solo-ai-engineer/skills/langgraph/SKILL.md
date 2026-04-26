---
name: langgraph
disable-model-invocation: true
description: Understand LangGraph v1.0 thoroughly
---

# LangGraph Development Principles

If you are coding with LangGraph, follow these principles and patterns.

## Critical Structure Requirements

### MANDATORY FIRST STEP
Before creating any files, **always search the codebase** for existing LangGraph-related files:
- Files with names like: `graph.py`, `main.py`, `app.py`, `agent.py`, `workflow.py`
- Files containing: `.compile()`, `StateGraph`, `create_react_agent`, `app =`, graph exports
- Any existing LangGraph imports or patterns

**If any LangGraph files exist**: Follow the existing structure exactly. Do not create new agent.py files.

**Only create agent.py when**: Building from completely empty directory with zero existing LangGraph files.

- When starting from scratch, ensure all of the following:
  1. `agent.py` at project root with compiled graph exported as `app`
  2. `langgraph.json` configuration file in the same directory as the graph
  3. Proper state management defined with `TypedDict` or Pydantic `BaseModel`
  4. Test small components before building complex graphs

## Deployment-First Principles

**CRITICAL**: All LangGraph agents should be written for DEPLOYMENT unless otherwise specified.

### Core Requirements:
- **NEVER ADD A CHECKPOINTER** unless explicitly requested by user
- Always export compiled graph as `app`
- Use prebuilt components when possible
- Follow model preference hierarchy: Anthropic > OpenAI > Google
- Keep state minimal (MessagesState usually sufficient)

#### AVOID unless user specifically requests
```python
# Don't do this unless asked!
from langgraph.checkpoint.memory import MemorySaver
graph = create_react_agent(model, tools, checkpointer=MemorySaver())
```

#### For existing codebases
- Always search for existing graph export patterns first
- Work within the established structure rather than imposing new patterns
- Do not create `agent.py` if graphs are already exported elsewhere

### Standard Structure for New Projects:
```
./agent.py          # Main agent file, exports: app
./langgraph.json    # LangGraph configuration
```

### Export Pattern:
```python
from langgraph.graph import StateGraph, START, END
# ... your state and node definitions ...

# Build your graph
graph_builder = StateGraph(YourState)
# ... add nodes and edges ...

# Export as 'app' for new agents from scratch
graph = graph_builder.compile()
app = graph  # Required for new LangGraph agents
```

## Prefer Prebuilt Components

**Always use prebuilt components when possible** - they are deployment-ready and well-tested.

### Basic Agents - Use create_react_agent:
```python
from langgraph.prebuilt import create_react_agent

# Simple, deployment-ready agent
graph = create_react_agent(
    model=model,
    tools=tools,
    prompt="Your agent instructions here"
)
app = graph
```

### Multi-Agent Systems:

#### Supervisor Pattern (central coordination):
```python
from langgraph_supervisor import create_supervisor

supervisor = create_supervisor(
    agents=[agent1, agent2],
    model=model,
    prompt="You coordinate between agents..."
)
app = supervisor.compile()
```
Documentation: https://langchain-ai.github.io/langgraph/reference/supervisor/

#### Swarm Pattern (dynamic handoffs):
```python
from langgraph_swarm import create_swarm, create_handoff_tool

alice = create_react_agent(
    model,
    [tools, create_handoff_tool(agent_name="Bob")],
    prompt="You are Alice.",
    name="Alice",
)

workflow = create_swarm([alice, bob], default_active_agent="Alice")
app = workflow.compile()
```
Documentation: https://langchain-ai.github.io/langgraph/reference/swarm/

### Only Build Custom StateGraph When:
- Prebuilt components don't fit the specific use case
- User explicitly asks for custom workflow
- Complex branching logic required
- Advanced streaming patterns needed

## Model Preferences

**LLM MODEL PRIORITY** (follow this order):
```python
# 1. PREFER: Anthropic
from langchain_anthropic import ChatAnthropic
model = ChatAnthropic(model="claude-3-5-sonnet-20241022")

# 2. SECOND CHOICE: OpenAI 
from langchain_openai import ChatOpenAI
model = ChatOpenAI(model="gpt-4o")

# 3. THIRD CHOICE: Google
from langchain_google_genai import ChatGoogleGenerativeAI
model = ChatGoogleGenerativeAI(model="gemini-1.5-pro")
```

**NOTE**: Assume API keys are available in environment.
During development, ignore missing key errors.

## Message and State Handling

### CRITICAL: Extract Message Content Properly
```python
# CORRECT: Extract message content properly
result = agent.invoke({"messages": state["messages"]})
if result.get("messages"):
    final_message = result["messages"][-1]  # This is a message object
    content = final_message.content         # This is the string content

# WRONG: Treating message objects as strings
content = result["messages"][-1]  # This is an object, not a string!
if content.startswith("Error"):   # Will fail - objects don't have startswith()
```

### State Updates Must Be Dictionaries:
```python
def my_node(state: State) -> Dict[str, Any]:
    # Do work...
    return {
        "field_name": extracted_string,    # Always return dict updates
        "messages": updated_message_list   # Not the raw messages
    }
```

## Streaming and Interrupts

### Streaming Patterns:
- Interrupts only work with `stream_mode="updates"`, not `stream_mode="values"`
- In "updates" mode, events are structured as `{node_name: node_data, ...}`
- Check for `"__interrupt__"` key directly in the event object
- Iterate through `event.items()` to access individual node outputs

- Interrupts appear as `event["__interrupt__"]` containing a tuple of `Interrupt` objects
- Access interrupt data via `interrupt_obj.value` where `interrupt_obj = event["__interrupt__"][0]`

Documentation:
- LangGraph Streaming: https://langchain-ai.github.io/langgraph/how-tos/stream-updates/
- SDK Streaming: https://langchain-ai.github.io/langgraph/cloud/reference/sdk/python_sdk_ref/#stream
- Concurrent Interrupts: https://docs.langchain.com/langgraph-platform/interrupt-concurrent

### When to Use Interrupts:
Use `interrupt()` when you need:
- User approval for generated plans or proposed changes
- Human confirmation before executing potentially risky operations
- Additional clarification when the task is ambiguous
- User input data entry or for decision points that require human judgment
- Feedback on partially completed work before proceeding

### Correct Interrupt Usage:
```python
# CORRECT: interrupt() pauses execution for human input
interrupt("Please confirm action")
# Execution resumes after human provides input through platform

# AVOID: Treating interrupt() as synchronous
result = interrupt("Please confirm action")  # Wrong - doesn't return values
if result == "yes":  # This won't work
    proceed()
```

## Common LangGraph Errors to Avoid

- Incorrect `interrupt()` usage: It pauses execution, doesn't return values
- Refer to documentation for best interrupt handling practices, including waiting for user input and proper handling of it
- Wrong state update patterns: Return updates, not full state
- Missing state type annotations
- Missing state fields (current_field, user_input)
- Invalid edge conditions: Ensure all paths have valid transitions
- Not handling error states properly
- Not exporting graph as 'app' when creating new LangGraph agents from scratch
- Forgetting `langgraph.json` configuration
- **Type assumption errors**: Assuming message objects are strings, or that state fields are certain types
- **Chain operations without type checking**: Like `state.get("field", "")[-1].method()` without verifying types

## Framework Integration Patterns

### Integration Debugging
When building integrations, always start with debugging:

```python
# Temporary debugging for new integrations
def my_integration_function(input_data, config):
    print(f"=== DEBUG START ===")
    print(f"Input type: {type(input_data)}")
    print(f"Input data: {input_data}")
    print(f"Config type: {type(config)}")
    print(f"Config data: {config}")
    
    # Process...
    result = process(input_data, config)
    
    print(f"Result type: {type(result)}")
    print(f"Result data: {result}")
    print(f"=== DEBUG END ===")
    
    return result
```

### Config Propagation Verification
Always verify the receiving end actually uses configuration:

```python
# WRONG: Assuming config is used
def my_node(state: State) -> Dict[str, Any]:
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# CORRECT: Actually using config
def my_node(state: State, config: RunnableConfig) -> Dict[str, Any]:
    # Extract configuration
    configurable = config.get("configurable", {})
    system_prompt = configurable.get("system_prompt", "Default prompt")
    
    # Use configuration in messages
    messages = [SystemMessage(content=system_prompt)] + state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}
```
## Patterns to Avoid

### Don't Mix Responsibilities in Single Nodes:
```python
# AVOID: LLM call + tool execution in same node
def bad_node(state):
    ai_response = model.invoke(state["messages"])  # LLM call
    tool_result = tool_node.invoke({"messages": [ai_response]})  # Tool execution
    return {"messages": [...]}  # Mixed concerns!

# PREFER: Separate nodes for separate concerns
def llm_node(state):
    return {"messages": [model.invoke(state["messages"])]}

def tool_node(state):
    return ToolNode(tools).invoke(state)

# Connect with edges
workflow.add_edge("llm", "tools")
```

### Overly Complex Agents When Simple Ones Suffice
```python
# AVOID: Unnecessary complexity
workflow = StateGraph(ComplexState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", tool_node)
# ... 20 lines of manual setup when create_react_agent would work
```

### Avoid Overly Complex State:
```python
# AVOID: Too many state fields
class State(TypedDict):
    messages: List[BaseMessage]
    user_input: str
    current_step: int
    metadata: Dict[str, Any]
    history: List[Dict]
    # ... many more fields

# PREFER: Use MessagesState when sufficient
from langgraph.graph import MessagesState
```

### Wrong Export Patterns
```python
# AVOID: Wrong variable names or missing export
compiled_graph = workflow.compile()  # Wrong name
# Missing: app = compiled_graph
```

### Incorrect interrupt() usage
```python
# AVOID: Treating interrupt() as synchronous
result = interrupt("Please confirm action")  # Wrong - doesn't return values
if result == "yes":  # This won't work
    proceed()

# CORRECT: interrupt() pauses execution for human input
interrupt("Please confirm action")
# Execution resumes after human provides input through platform
```
Reference: https://langchain-ai.github.io/langgraph/concepts/streaming/#whats-possible-with-langgraph-streaming

## LangGraph-Specific Coding Standards

### Structured LLM Calls and Validation
When working with LangGraph nodes that involve LLM calls, always use structured output with Pydantic dataclasses:

- Use `with_structured_output()` method for LLM calls that need specific response formats
- Define Pydantic BaseModel classes for all structured data (state schemas, LLM responses, tool inputs/outputs)
- Validate and parse LLM responses using Pydantic models
- For conditional nodes relying on LLM decisions, use structured output

Example: `llm.with_structured_output(MyPydanticModel).invoke(messages)` instead of raw string parsing

### General Guidelines:
- Test small components before building complex graphs
- **Avoid unnecessary complexity**: Consider if simpler approaches with prebuilt components would achieve the same goals
- Write concise and clear code without overly verbose implementations
- Only install trusted, well-maintained packages

## Documentation Guidelines

### When to Consult Documentation:
Always use documentation tools before implementing LangGraph code (the API evolves rapidly):
- Before creating new graph nodes or modifying existing ones
- When implementing state schemas or message passing patterns
- Before using LangGraph-specific decorators, annotations, or utilities
- When working with conditional edges, dynamic routing, or subgraphs
- Before implementing tool calling patterns within graph nodes
 - When building applications that integrate multiple frameworks (e.g., LangGraph + Streamlit, LangGraph + Next.js/React), also consult the framework docs to ensure correct syntax and patterns

### Key Documentation Resources:
- LangGraph Streaming: https://langchain-ai.github.io/langgraph/how-tos/stream-updates/
- LangGraph Config: https://langchain-ai.github.io/langgraph/how-tos/pass-config-to-tools/
- Supervisor Pattern: https://langchain-ai.github.io/langgraph/reference/supervisor/
- Swarm Pattern: https://langchain-ai.github.io/langgraph/reference/swarm/
- Agentic Concepts: https://langchain-ai.github.io/langgraph/concepts/agentic_concepts/

### Documentation Navigation
- Determine the base URL from the current documentation page
- For `../`, go one level up in the URL hierarchy
- For `../../`, go two levels up, then append the relative path
- Example: From `https://langchain-ai.github.io/langgraph/tutorials/get-started/langgraph-platform/setup/` with link `../../langgraph-platform/local-server`
  - Go up two levels: `https://langchain-ai.github.io/langgraph/tutorials/get-started/`
  - Append path: `https://langchain-ai.github.io/langgraph/tutorials/get-started/langgraph-platform/local-server`
- If you encounter an HTTP 404 error, the constructed URL is likely incorrect—rebuild it carefully