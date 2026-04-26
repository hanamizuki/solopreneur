# Prompt Quality Criteria

Use this rubric to evaluate and improve prompts before delivery.

## The 8-Point Quality Checklist

### 1. Clarity (Critical)
- Every instruction has one interpretation
- No pronouns without clear antecedents
- Technical terms are defined or contextualized
- **Test:** Could someone unfamiliar with the context follow this?

### 2. Structure (Critical)
- Logical flow from context → task → constraints → output
- Clear section separation (headers, numbering, or XML tags)
- Most important information comes first
- **Test:** Can you scan the prompt in 10 seconds and understand the task?

### 3. Specificity (High)
- Concrete examples over abstract descriptions
- Numbers over vague quantities ("3 paragraphs" not "a few paragraphs")
- Named references ("Write like Paul Graham" not "Write casually")
- **Test:** Replace every adjective with a measurable criterion.

### 4. Constraints (High)
- Explicit length limits (word count, section count, time)
- Clear format specification (JSON, markdown, bullet list)
- Tone defined with examples or references
- Exclusions stated ("Do not include...", "Avoid...")
- **Test:** Are the boundaries of "correct output" clear?

### 5. Framework Fit (Medium)
- Chosen technique matches the task type
- Not over-engineered (simple tasks don't need ToT)
- Combines frameworks when beneficial
- **Test:** Would removing the framework make the output worse?

### 6. Completeness (Medium)
- All necessary context provided
- Role/persona defined when beneficial
- Edge cases addressed
- **Test:** Does the model need to ask follow-up questions?

### 7. Testability (Medium)
- Success criteria are measurable
- Output can be evaluated objectively
- Wrong outputs are identifiable
- **Test:** Could you write a grading rubric for the output?

### 8. Efficiency (Low but valuable)
- No redundant instructions
- No over-explanation of things the model knows
- Token-efficient without sacrificing clarity
- **Test:** Can you remove any sentence without losing quality?

## Common Anti-Patterns

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Vague persona | "Be helpful" gives no direction | Specify role, expertise, and behavioral traits |
| Missing format | Model guesses output structure | Define exact format with example |
| Contradictory rules | "Be concise" + "Be thorough" | Prioritize: "Be thorough, max 500 words" |
| No examples | Model has no calibration | Add 2-3 few-shot examples |
| Wall of text | Hard to parse, instructions buried | Use headers, bullets, numbered steps |
| Over-prompting | Simple task with 500-word prompt | Match prompt complexity to task complexity |
| Assuming context | "Continue from before" | Include all necessary context in the prompt |
| Negative-only rules | "Don't do X, Y, Z" | State what TO do, not just what to avoid |

## Prompt Complexity Guide

Match prompt length to task complexity:

| Task Complexity | Prompt Length | Frameworks |
|---|---|---|
| Simple (translate, summarize) | 2-5 sentences | Zero-shot, light constraints |
| Medium (analyze, compare) | 1-2 paragraphs | CoT or few-shot |
| Complex (research, create) | Structured sections | Persona + CoT + constraints |
| System prompt (agent/GPT) | Full template | Multiple frameworks combined |

## Self-Review Protocol

Before delivering a prompt, run this mental checklist:

1. Read the prompt as if you're the LLM seeing it for the first time
2. Identify any point where you'd ask "what do they mean?"
3. Check: does the output format match what the user actually needs?
4. Verify: would a wrong but plausible output be caught by the constraints?
5. Confirm: is this the simplest prompt that achieves the goal?

## Troubleshooting Guide

**Inconsistent outputs?**
- Add more few-shot examples
- Specify format more strictly
- Use self-consistency (multiple reasoning paths)

**Wrong outputs?**
- Add reasoning steps (CoT)
- Provide reference materials
- Use chain-of-verification

**Off-topic outputs?**
- Strengthen instruction/data separation (use XML tags or delimiters)
- Add explicit constraints
- Use role/persona prompting

**Too generic?**
- Add specific examples of "good" output
- Define audience and use case precisely
- Specify what distinguishes great from mediocre

## Model-Specific Tips

| Aspect | GPT-4/o | Claude | Gemini |
|---|---|---|---|
| Context | 128k | 200k | 1M+ |
| Best for | Code, APIs, structured | Analysis, writing, reasoning | Multimodal, search-grounded |
| Formatting | JSON-native | XML-friendly | Flexible |
| Reasoning | "Let's think step by step" | `<thinking>` tags | Integrated |
| Few-shot | Essential for complex tasks | Helpful, use `<examples>` tags | Optional |

**Universal across all models:**
1. Be specific about output format
2. Provide examples for complex patterns
3. Separate instructions from data (delimiters, XML tags)
4. Define success criteria explicitly
5. Test with diverse inputs before deploying
