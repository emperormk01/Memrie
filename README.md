# Memrie

Extract and compress conversation context into structured `AGENTS.md` memory blocks. Works with any OpenAI-compatible API.


## Structure

```
## Work context
<1-2 sentences> ← Current project identity, dense nouns

## Personal context
<2-3 sentences> ← Communication style, preferences, no examples

## Top of mind
- <bullet> ← Active decisions, open questions, blocking issues (max 5)

## Brief history
<paragraphs> ← Recent months, detailed, grouped by theme

## Earlier context  
<paragraphs> ← Past phases, compressed, thematic

## Long-term background
- <one-liner> ← Persistent traits, background interests
```

## Quick Start

```bash
curl -fsSL https://bun.sh/install | bash
export OPENAI_API_KEY=sk-xxx
bun scripts/extract.ts -m ./AGENTS.md -c ./conversation.txt
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | API key (required) | - |
| `OPENAI_BASE_URL` | API endpoint | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Model | `gpt-4o-mini` |

Any OpenAI-compatible endpoint works: OpenAI, Anthropic via proxy, Ollama (`http://localhost:11434/v1`), Groq, Together, OpenRouter.

## Usage

```bash
# From file
bun scripts/extract.ts -m ./AGENTS.md -c ./chat.txt

# From raw text
bun scripts/extract.ts -m ./AGENTS.md --text "conversation text"

# From URL
bun scripts/extract.ts -m ./AGENTS.md -u https://example.com/chat

# Custom endpoint
OPENAI_BASE_URL=https://api.groq.com/openai/v1 bun scripts/extract.ts -m ./AGENTS.md -c ./chat.txt

# Dry run without writing
bun scripts/extract.ts -m ./AGENTS.md -c ./chat.txt -o /tmp/out.md
```

## How It Works

```
Conversation ends
       ↓
Memrie extracts new facts not already in AGENTS.md
       ↓
If no existing memory, creates fresh block
       ↓
If existing, merges with deduplication and compression
       ↓
Validates all 6 sections present, retries up to 3 times
       ↓
Writes updated AGENTS.md
```

## Improvements in Memrie

- Same two pass extraction and merge with validation loop

## License

MIT
