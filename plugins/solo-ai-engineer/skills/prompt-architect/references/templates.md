# Prompt Templates

Ready-to-use templates organized by use case. Adapt and combine as needed.

## Table of Contents
1. [System Prompt Template](#system-prompt-template)
2. [Analysis Prompt](#analysis-prompt)
3. [Creative Writing Prompt](#creative-writing-prompt)
4. [Code Generation Prompt](#code-generation-prompt)
5. [Data Extraction Prompt](#data-extraction-prompt)
6. [Decision-Making Prompt](#decision-making-prompt)
7. [Content Transformation Prompt](#content-transformation-prompt)
8. [Evaluation / Critique Prompt](#evaluation--critique-prompt)

---

## System Prompt Template

Use for creating custom GPTs, agents, or persistent assistants.

```
# Role
You are a [specific role] specializing in [domain].

# Objective
[One sentence: what this agent does]

# Context
- [Key fact the model needs]
- [Another key fact]
- [User profile or audience info]

# Instructions
1. [Step 1 of the workflow]
2. [Step 2]
3. [Step 3]

# Output Format
[Describe exact structure of responses]

# Constraints
- [What to avoid]
- [Boundaries]
- [Tone/style rules]

# Examples
Input: [sample input]
Output: [sample output]
```

---

## Analysis Prompt

Use for breaking down topics, evaluating ideas, or making sense of information.

```
Analyze [subject/input] from the perspective of [role/expertise].

Consider these dimensions:
1. [Dimension 1] - [what to evaluate]
2. [Dimension 2] - [what to evaluate]
3. [Dimension 3] - [what to evaluate]

For each dimension:
- State your finding
- Support with evidence from the input
- Rate severity/importance (1-5)

Conclude with:
- Top 3 actionable recommendations
- Overall assessment (one paragraph)
```

---

## Creative Writing Prompt

Use for stories, copy, scripts, and creative content.

```
You are a [specific creative role] known for [style trait].

Write a [format] about [topic].

Audience: [who reads this]
Tone: [specific tone]
Length: [word count or section count]

Must include:
- [Required element 1]
- [Required element 2]

Must avoid:
- [Forbidden element 1]
- [Forbidden element 2]

Style reference: [author, brand, or example to mimic]

Structure:
1. [Section 1 - purpose]
2. [Section 2 - purpose]
3. [Section 3 - purpose]
```

---

## Code Generation Prompt

Use for writing, refactoring, or debugging code.

```
Language: [programming language]
Framework: [if applicable]
Context: [what the codebase does]

Task: [specific coding task]

Requirements:
- [Functional requirement 1]
- [Functional requirement 2]
- [Performance/style requirement]

Constraints:
- [Version/compatibility]
- [Dependencies allowed/forbidden]
- [Style guide to follow]

Input example:
[sample input data]

Expected output:
[what the code should produce]

Include:
- Error handling for [specific cases]
- Comments explaining non-obvious logic
- [Tests/types/docs if needed]
```

---

## Data Extraction Prompt

Use for pulling structured data from unstructured text, images, or documents.

```
Extract the following fields from the provided [text/image/document]:

Fields:
1. field_name (type) - description [required/optional]
2. field_name (type) - description [required/optional]
3. field_name (type) - description [required/optional]

Output format: [JSON/table/CSV]

Rules:
- If a field is not found, output null
- If multiple values exist, return as array
- Normalize [dates to ISO 8601 / currencies to USD / etc.]
- Flag low-confidence extractions with "confidence": "low"

Example:
Input: [sample]
Output: [sample extraction]
```

---

## Decision-Making Prompt

Use for evaluating options and making recommendations.

```
I need to decide between [Option A], [Option B], and [Option C].

Context:
- [Relevant constraint 1]
- [Relevant constraint 2]
- [Priority: what matters most]

For each option, evaluate:
1. Pros (at least 3)
2. Cons (at least 3)
3. Risk level (low/medium/high)
4. Cost/effort estimate
5. Alignment with priority

Present as a comparison table, then give a clear recommendation with reasoning.

If the decision is close, state what additional information would tip the balance.
```

---

## Content Transformation Prompt

Use for converting content between formats, styles, or audiences.

```
Transform the following [source format] into [target format].

Source:
[input content]

Transformation rules:
- Audience: [original] → [target]
- Tone: [original] → [target]
- Length: [original] → [target]
- Technical level: [original] → [target]

Preserve:
- [Key information that must survive]
- [Specific terms or names]

Remove/simplify:
- [What to cut]
- [What to simplify]

Output in [format] with [structure requirements].
```

---

## Evaluation / Critique Prompt

Use for reviewing, grading, or providing feedback on content.

```
You are a [expert role] reviewing [what].

Evaluate against these criteria:
1. [Criterion 1] - weight: [high/medium/low]
2. [Criterion 2] - weight: [high/medium/low]
3. [Criterion 3] - weight: [high/medium/low]

For each criterion:
- Score: [1-10]
- Strengths: [what works]
- Weaknesses: [what doesn't]
- Specific fix: [actionable improvement]

Overall score: [weighted average]
Summary: [2-3 sentences]
Top priority fix: [single most impactful change]
```
