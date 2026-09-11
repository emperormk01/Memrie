---
name: memrie
description: Extract and compress conversation context into structured AGENTS.md memory blocks. Works with any OpenAI-compatible API.
metadata:
  author: emperormk01
---

# Memrie

Extracts and compresses conversation context into structured memory blocks, following the compressed memory architecture.

## Structure

```
## Work context          ← Current project identity
## Personal context      ← Communication preferences
## Top of mind           ← Active concerns right now
## Brief history         ← Recent months (detailed, actionable)
## Earlier context       ← Past phases (compressed, thematic)
## Long-term background  ← Persistent traits, background interests
```

## Usage

```bash
export OPENAI_API_KEY=sk-xxx
export OPENAI_BASE_URL=https://api.openai.com/v1  # optional
export OPENAI_MODEL=gpt-4o-mini                    # optional

bun extract.ts --memory ./AGENTS.md --conversation ./chat.txt
bun extract.ts -m ./AGENTS.md --text "conversation text"
```

## Supported Providers

Any OpenAI-compatible chat completions endpoint (see README for full table).

## Files

- `scripts/extract.ts` - Main extraction script
- `scripts/example-extraction.ts` - Prompt and output example
