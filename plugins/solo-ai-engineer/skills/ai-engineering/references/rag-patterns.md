# RAG Patterns

## Chunking strategies

| Strategy | When to use |
|---|---|
| Fixed size (512 tokens, 50 overlap) | Default — works for most docs |
| Sentence-based | Conversational content, FAQs |
| Semantic chunking | Long docs where paragraphs are coherent units |
| Parent-child | Retrieve small chunks, return larger context window |

## Hybrid search (keyword + semantic)

Combine BM25 (keyword) with vector search for better recall:

```python
# With Qdrant
from qdrant_client import QdrantClient
from qdrant_client.models import SparseVectorParams, VectorParams

# Store both dense and sparse vectors
# Query both and merge with RRF (Reciprocal Rank Fusion)
```

Rule of thumb: hybrid search beats pure vector search for factual retrieval.

## Re-ranking

After initial retrieval (top 20), re-rank with a cross-encoder before passing to LLM:

```python
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
scores = reranker.predict([(query, doc) for doc in retrieved_docs])
top_docs = [doc for _, doc in sorted(zip(scores, retrieved_docs), reverse=True)][:5]
```

## HyDE (Hypothetical Document Embeddings)

Generate a hypothetical answer first, embed that, then search:

```python
hypothetical = llm.complete(f"Write a short answer to: {query}")
results = collection.query(query_texts=[hypothetical], n_results=5)
```

Good for: queries that are very different in style from the documents.

## Evaluation

Build an eval set BEFORE building the system:

```python
eval_set = [
    {"question": "What is the refund policy?", "expected_answer": "30 days"},
    ...
]

# Metrics to track:
# - Retrieval recall: is the right chunk retrieved?
# - Answer faithfulness: does the answer match retrieved context?
# - Answer relevance: does the answer address the question?
```

Tools: RAGAS (automated RAG eval), TruLens, LangSmith.

## Context window management

- Max 4–6 chunks in context (quality > quantity)
- Filter duplicates before passing to LLM
- Add source metadata: `[Source: doc_name, page: 3]`
- If chunks > 6k tokens total → summarize before passing
