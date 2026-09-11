---
name: memrie
description: Memory product with extractor, dynamic context builder, embedding cache, and tiered memory for any agent harness. Use when the agent needs to remember conversations, pack context within token budgets, cache similar queries, or persist working/episodic/semantic memory.
compatibility: Works with any harness via library or HTTP sidecar. Bun/Node via import, Python via HTTP.
metadata:
  author: emperormk01
---

# Memrie Skill

Memrie turns conversations into structured memory, packs context within token budgets, caches answers by meaning, and keeps tiered memory for any agent framework.

## When to use

- After a conversation ends and you need to update `AGENTS.md`
- Before calling an LLM and you need to pack memory + docs + tools + history within a budget
- When the same or similar query is asked repeatedly and you want instant cached answers
- When the agent needs to remember recent events, distilled facts, or current turn context
- When Python, LangChain, CrewAI, or any non-JS harness needs memory without npm

## Commands

### 0. Unified CLI - `memrie this`, `memrie that`

One binary, all features. Run via `bun run src/cli.ts` or compiled `memrie`:

```bash
memrie extract -m ./AGENTS.md -c ./chat.txt
memrie build --query "Where is my order?" --memory ./AGENTS.md --docs ./docs.json
memrie cache store --query "How to debounce?" --answer "Use setTimeout..."
memrie cache lookup --query "How to debounce?"
memrie cache stats
memrie memory working --add "deploy failed"
memrie memory episodic --add "deployment success" --search "deploy"
memrie memory semantic --add "User prefers direct answers" --search "direct"
memrie serve --port 3000 --db ./memrie.db
memrie --help
```

Build a single file binary: `bun build src/cli.ts --compile --outfile memrie` (5 to 6 MB stripped).

### 1. Extractor (turn conversations into AGENTS.md)

```bash
# From file
bun scripts/extract.ts -m ./AGENTS.md -c ./conversation.txt

# From raw text
bun scripts/extract.ts -m ./AGENTS.md --text "conversation text"

# From URL
bun scripts/extract.ts -m ./AGENTS.md -u https://example.com/chat

# Custom endpoint
OPENAI_BASE_URL=https://api.groq.com/openai/v1 bun scripts/extract.ts -m ./AGENTS.md -c ./chat.txt

# Dry run to file
bun scripts/extract.ts -m ./AGENTS.md -c ./chat.txt -o /tmp/out.md

# Help
bun scripts/extract.ts --help
```

Extractor does: two-pass extraction, merge with existing memory, dedup, validation loop (3 retries), hard cap 3,000 tokens via 4-char principle.

Structure it writes:

```
## Work context          ← 1-2 sentences, current project identity, dense nouns
## Personal context      ← 2-3 sentences, communication style, preferences
## Top of mind           ← max 5 bullets, active decisions and blockers
## Brief history         ← recent months, detailed paragraphs grouped by theme
## Earlier context       ← past phases, compressed thematic
## Long-term background  ← one-liners, persistent traits
```

### 2. Library (any JS/TS harness)

```ts
import { Memrie } from "./src/index.ts";
const memrie = new Memrie("./memrie.db");

// Dynamic context builder
const packet = memrie.buildContext({
  query: "Where is my order 4921?",
  memory: readFileSync("./AGENTS.md", "utf-8"),
  docs: [{ content: "shipping doc", source: "shipping.md", score: 0.9 }],
  tools: [{ name: "lookupOrder", description: "lookup order by id" }],
  history: ["user: hello", "assistant: hi"],
  budget: { total: 8000, memory: 3000, docs: 2400 }, // optional, defaults to 8k total
});
// packet.prompt, packet.tokensUsed, packet.trimmed, packet.trace

// Embedding cache
await memrie.cacheAnswer("How to debounce in JS?", "Use setTimeout...");
const hit = await memrie.cachedQuery("Show me JS debounce");
// hit.hit, hit.score, hit.answer

// Tiered memory
memrie.working.add("user", "deploy failed");
memrie.working.all(); // current turn
memrie.episodic.add("raw log", "deployment success", 0.9);
memrie.episodic.recent(20);
memrie.episodic.search("deployment");
memrie.semantic.add("User prefers direct answers", "conversation");
memrie.semantic.recall("direct answers");
memrie.semantic.pin(id);
```

### 3. HTTP sidecar (any language, zero npm stress)

```bash
bun run src/server.ts
# or
PORT=3000 bun run src/server.ts
```

Endpoints:

```bash
# Health
GET /

# Context builder
POST /context/build
# body: { query, memory, docs, tools, history, budget }

# Working memory (RAM, 6k tokens)
POST /memory/working   # { role, content }
GET  /memory/working

# Episodic memory (SQLite, timestamped events)
POST /memory/episodic  # { raw, summary, importance }
GET  /memory/episodic?q=pricing

# Semantic memory (SQLite, distilled facts)
POST /memory/semantic  # { text, source }
GET  /memory/semantic?q=pricing

# Embedding cache
POST /cache/store      # { query, answer }
POST /cache/lookup     # { query, threshold }
GET  /cache/stats      # { totalEntries, totalHits, byDay, hitRate }

# Stats
GET /stats
```

Python example:

```py
import requests
r = requests.post("http://localhost:3000/context/build", json={
  "query": "Where is my order?",
  "memory": open("AGENTS.md").read(),
  "docs": [{"content": "doc", "source": "a.md", "score": 1}],
  "tools": [{"name": "lookupOrder", "description": "..."}]
})
prompt = r.json()["prompt"]
```

## How to choose

- Need to update AGENTS.md after a chat? Use `scripts/extract.ts`.
- Need to pack context before an LLM call with docs and tools? Use `buildContext` or `POST /context/build`.
- Need to save cost on repeat queries? Use `cacheAnswer` / `cachedQuery` or `/cache/*`.
- Need to remember what happened? Use working for now, episodic for events, semantic for facts.

## Tips

- Keep `AGENTS.md` as the single source of truth for long-term memory. Let the extractor handle merging; do not hand-edit and then run without reading existing memory (the script reads it and dedups).
- For `buildContext`, pass docs sorted by relevance score; the builder keeps highest scores first and drops lowest when over budget. Check `packet.trimmed` to log what was cut.
- For cache, threshold 0.92 is strict (exact paraphrase). Lower to 0.85 if you want broader hits. Google `gemini-embedding-001` (3072d) is more accurate than local hash; use it when you have `GOOGLE_API_KEY`.
- For episodic, set `importance` 0.9 for critical events (deploys, decisions), 0.3 for noisy logs. The store auto-evicts lowest importance + oldest when over 500 episodes, and compresses oldest 10 into one summary every 100.
- For semantic, `pin()` important facts (user name, core preferences) so they never evict. The store dedups by normalized text and bumps `recallCount`.
- Token budgeting: 4-char principle is fast but approximate. For precise counts per model, swap `estimateTokens` with tiktoken later; the builder is already isolated in `src/tokens.ts`.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | For extraction | - |
| `OPENAI_BASE_URL` | Extraction endpoint | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Extraction model | `gpt-4o-mini` |
| `MEMRIE_EMBEDDER` | `local` or `google` or `openai` | `local` |
| `GOOGLE_API_KEY` | For Google embeddings (`gemini-embedding-001`, `gemini-embedding-2`) | - |
| `GOOGLE_EMBED_MODEL` | Google model name | `gemini-embedding-001` |
| `OPENAI_MODEL_EMBED` | OpenAI embed model | `text-embedding-3-small` |
| `MEMRIE_DB` | SQLite path (zero infra) | `./memrie.db` |
| `PORT` | Sidecar port | `3000` |

## Files

- `scripts/extract.ts` - extractor with 3k cap and validation
- `scripts/example-extraction.ts` - prompt and output example
- `src/tokens.ts` - 4-char estimator
- `src/contextBuilder.ts` - budgeted packing
- `src/embedder/index.ts` - Local, Google, OpenAI
- `src/cache/index.ts` - SQLite embedding cache + hit rate
- `src/memory/working.ts` - RAM turn memory
- `src/memory/episodic.ts` - SQLite timestamped events
- `src/memory/semantic.ts` - SQLite distilled facts
- `src/server.ts` - Hono HTTP sidecar
- `src/index.ts` - Unified `Memrie` class
