# Prompt Engineering Frameworks

## Table of Contents
1. [Chain-of-Thought (CoT)](#chain-of-thought-cot)
2. [Few-Shot Prompting](#few-shot-prompting)
3. [Zero-Shot with Structure](#zero-shot-with-structure)
4. [Persona / Role Prompting](#persona--role-prompting)
5. [Tree-of-Thought (ToT)](#tree-of-thought-tot)
6. [ReAct (Reason + Act)](#react-reason--act)
7. [Self-Consistency](#self-consistency)
8. [Prompt Chaining](#prompt-chaining)
9. [Meta-Prompting](#meta-prompting)
10. [Structured Output Prompting](#structured-output-prompting)
11. [Constitutional / Guardrail Prompting](#constitutional--guardrail-prompting)
12. [Multimodal Prompting](#multimodal-prompting)

---

## Chain-of-Thought (CoT)

**When to use:** Reasoning tasks, math, logic, multi-step analysis, debugging.

**Pattern:**
```
[Task description]

Think through this step-by-step:
1. First, [identify/analyze]...
2. Then, [evaluate/compare]...
3. Finally, [conclude/decide]...

Show your reasoning before giving the final answer.
```

**Example:**
- Before: "Is this business idea profitable?"
- After: "Analyze this business idea for profitability. Think step-by-step: (1) Estimate the addressable market size, (2) Calculate unit economics (cost per unit vs. revenue per unit), (3) Identify the top 3 risks, (4) Give a profitability verdict with confidence level (high/medium/low)."

---

## Few-Shot Prompting

**When to use:** Classification, formatting, style matching, consistent outputs, when the model needs calibration.

**Pattern:**
```
[Task description]

Examples:
Input: [example 1 input]
Output: [example 1 output]

Input: [example 2 input]
Output: [example 2 output]

Input: [example 3 - edge case]
Output: [example 3 output]

Now process:
Input: [actual input]
Output:
```

**Tips:**
- Include 2-5 examples (3 is usually optimal)
- Always include at least one edge case example
- Keep examples representative of real inputs
- Order: easy → medium → edge case

---

## Zero-Shot with Structure

**When to use:** When the model already knows the task well but needs output structure.

**Pattern:**
```
[Clear task description]

Output format:
- [Section 1]: [what goes here]
- [Section 2]: [what goes here]
- [Section 3]: [what goes here]

Constraints:
- [Constraint 1]
- [Constraint 2]
```

---

## Persona / Role Prompting

**When to use:** Creative tasks, domain expertise, tone control, specialized analysis.

**Pattern:**
```
You are a [specific role] with [specific expertise/experience].

Your task: [what to do]

Context: [relevant background]

Your response should reflect:
- [Quality 1 of the persona]
- [Quality 2 of the persona]

[Output instructions]
```

**Tips:**
- Be specific: "senior iOS developer with 10 years SwiftUI experience" beats "programmer"
- Include behavioral traits, not just job title
- Combine with other frameworks (persona + CoT is powerful)

---

## Tree-of-Thought (ToT)

**When to use:** Complex problems with multiple valid approaches, strategic decisions, creative exploration.

**Pattern:**
```
[Problem description]

Explore this problem using multiple approaches:

Approach 1: [Name]
- Reasoning: ...
- Pros: ...
- Cons: ...

Approach 2: [Name]
- Reasoning: ...
- Pros: ...
- Cons: ...

Approach 3: [Name]
- Reasoning: ...
- Pros: ...
- Cons: ...

Compare all approaches and select the best one with justification.
```

---

## ReAct (Reason + Act)

**When to use:** Tasks requiring tool use, research, iterative problem-solving.

**Pattern:**
```
Solve this task by alternating between thinking and acting:

Thought: [What do I need to figure out?]
Action: [What tool/step to take]
Observation: [What did I learn?]
... repeat ...
Final Answer: [Conclusion]

Task: [description]
Available tools: [list]
```

---

## Self-Consistency

**When to use:** High-stakes decisions, when you need confidence in the answer.

**Pattern:**
```
[Task description]

Generate 3 independent solutions to this problem, each using a different approach.
Then compare them and identify the answer that appears most consistently.

Solution 1 (approach: [name]):
Solution 2 (approach: [name]):
Solution 3 (approach: [name]):

Consensus answer:
Confidence level:
```

---

## Prompt Chaining

**When to use:** Complex multi-step workflows, when output quality degrades in a single prompt.

**Pattern:** Break into sequential prompts where each output feeds the next:

```
Prompt 1 (Research): "Gather key facts about [topic]. Output as bullet points."
    ↓
Prompt 2 (Analyze): "Given these facts: [output 1]. Identify the top 3 insights."
    ↓
Prompt 3 (Generate): "Using these insights: [output 2]. Write a [deliverable]."
```

**Tips:**
- Each prompt should have a single clear objective
- Define the output format of each step to feed cleanly into the next
- Use for: research → analysis → writing pipelines

---

## Meta-Prompting

**When to use:** When you want the model to improve its own approach, self-critique.

**Pattern:**
```
[Generate initial output]

Now review your output:
1. What assumptions did you make?
2. What could be improved?
3. What edge cases did you miss?

Revise your output based on this self-review.
```

---

## Structured Output Prompting

**When to use:** API responses, data extraction, form filling, any machine-readable output.

**Pattern:**
```
Extract the following information from the text below.

Output as JSON matching this schema:
{
  "field1": "string - description",
  "field2": "number - description",
  "field3": ["string"] - description,
  "field4": "enum: option1 | option2 | option3"
}

If a field cannot be determined, use null.

Text: [input]
```

**Tips:**
- Provide the exact schema with types and descriptions
- Specify null/default behavior for missing data
- Include an example output for complex schemas

---

## Constitutional / Guardrail Prompting

**When to use:** When outputs need safety, brand compliance, or specific quality gates.

**Pattern:**
```
[Task description]

Before outputting, verify your response against these rules:
1. [Rule 1 - e.g., "No medical advice"]
2. [Rule 2 - e.g., "Stay within brand voice"]
3. [Rule 3 - e.g., "Cite sources for claims"]

If any rule is violated, revise before outputting.
```

---

## Multimodal Prompting

**When to use:** When input includes images, video, audio, or documents alongside text.

**Pattern:**
```
I'm providing [media type]. Analyze it for:
1. [Specific aspect to extract]
2. [Specific aspect to extract]
3. [Specific aspect to extract]

Context: [Why this matters]

Based on your analysis, [what to do with the findings].
```

**Tips:**
- Be explicit about what to look for in visual/audio content
- Reference specific parts of the media ("In the top-left of the image...")
- Combine with other frameworks: image analysis + CoT for reasoning about visuals

---

## Framework Combinations

The most powerful prompts often combine frameworks:

| Combination | Use Case |
|---|---|
| Persona + CoT | Expert analysis with reasoning |
| Few-Shot + Structured Output | Consistent data extraction |
| CoT + Self-Consistency | High-confidence reasoning |
| Persona + Constitutional | Brand-safe creative content |
| Prompt Chain + Few-Shot | Multi-step with calibrated outputs |
| Meta + any framework | Self-improving outputs |

## Format Best Practices

**When to use markdown:** Human-readable outputs, reports, articles
**When to use XML tags:** Separating sections in prompts, model-to-model communication
**When to use JSON:** Structured data, API responses, machine-readable output
**When to use numbered steps:** Sequential processes, CoT reasoning
**When to use bullets:** Lists, non-sequential items, feature descriptions
