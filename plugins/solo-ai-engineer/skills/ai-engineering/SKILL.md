---
name: ai-engineering
disable-model-invocation: true
description: >-
  AI/ML engineering specialist for building intelligent features, RAG systems,
  LLM integrations, data pipelines, vector search, and AI-powered applications.
  Use when building anything involving: LLMs, embeddings, vector databases, RAG,
  fine-tuning, prompt engineering, AI agents, ML pipelines, or deploying models
  to production. NOT for general web dev (use rapid-prototyper) or simple API calls.
---

# AI Engineer

Build practical AI systems that work in production. Data-driven, systematic, performance-focused.

## Core Capabilities

- **LLM Integration**: OpenAI, Anthropic, local models (Ollama, llama.cpp), LiteLLM
- **RAG Systems**: Chunking, embeddings, vector search, retrieval, re-ranking
- **Vector DBs**: Chroma (local), Pinecone (managed), Weaviate, FAISS, Qdrant
- **Agents & Tools**: Tool-calling, multi-step agents, OpenClaw sub-agents
- **Data Pipelines**: Ingestion, cleaning, transformation, feature engineering
- **MLOps**: Model versioning (MLflow), monitoring, drift detection, A/B testing
- **Evaluation**: Benchmark construction, bias testing, performance metrics

## Decision Framework

### Which LLM provider?
- **Prototyping/speed**: OpenAI GPT-4o or Anthropic Claude Sonnet
- **Local/private**: Ollama + Qwen 2.5 32B or Llama 3.3 70B
- **Multi-provider abstraction**: LiteLLM (swap models without code changes)
- **Embeddings**: text-embedding-3-small (OpenAI) or nomic-embed-text (local)

### Which vector DB?
- **Local/dev**: Chroma (zero setup)
- **Production managed**: Pinecone
- **Self-hosted production**: Qdrant or Weaviate
- **Already in Postgres**: pgvector extension

### RAG or fine-tuning?
- **RAG first** — always try RAG before fine-tuning. 90% of cases RAG is enough.
- Fine-tune only when: style/tone change needed, domain vocab is highly specialized, latency must be minimal

## RAG Workflow

### 1. Ingest
```python
# Chunk documents (rule of thumb: 512 tokens, 50 overlap)
from langchain.text_splitter import RecursiveCharacterTextSplitter
splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50)
chunks = splitter.split_documents(docs)
```

### 2. Embed + store
```python
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

client = chromadb.PersistentClient(path="./chroma_db")
ef = OpenAIEmbeddingFunction(api_key=os.environ["OPENAI_API_KEY"], model_name="text-embedding-3-small")
collection = client.get_or_create_collection("docs", embedding_function=ef)
collection.add(documents=[c.page_content for c in chunks], ids=[str(i) for i in range(len(chunks))])
```

### 3. Retrieve + generate
```python
results = collection.query(query_texts=[user_query], n_results=5)
context = "\n\n".join(results["documents"][0])

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": f"Answer based on this context:\n{context}"},
        {"role": "user", "content": user_query},
    ]
)
```

See `references/rag-patterns.md` for advanced patterns: re-ranking, hybrid search, HyDE, eval.

## LLM Tool Calling (Agents)

```python
tools = [{
    "type": "function",
    "function": {
        "name": "search_docs",
        "description": "Search internal documentation",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"]
        }
    }
}]

response = openai.chat.completions.create(model="gpt-4o", messages=messages, tools=tools)
```

See `references/agent-patterns.md` for multi-step agent loops, error handling, tool schemas.

## Critical Rules

- **Evaluate early** — build an eval set before you build the system
- **RAG before fine-tuning** — always
- **Log everything** — prompts, completions, latency, token usage from day one
- **Test for bias** — especially for user-facing classification or scoring systems
- **Never hardcode API keys** — use env vars or secret managers

## References

- `references/rag-patterns.md` — Chunking strategies, re-ranking, HyDE, hybrid search, evaluation
- `references/agent-patterns.md` — Tool calling, multi-step loops, memory, error handling
