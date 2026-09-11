# Memrie

Extract and compress conversation context into structured `AGENTS.md` memory blocks. Now a product with dynamic context building, embedding cache, and tiered memory for any agent harness.

Single file hard cap: 3,000 tokens (12,000 chars, 4-char principle).

## Product features

**1. Dynamic context builder** - Budgets tokens across memory, docs, and tools per request. Never blows the model window. `buildContext({ query, memory, docs, tools, history, budget })` returns a packed prompt with trim trace.

**2. Embedding-based cache** - Stores answers keyed by embedding of the query. On similar queries returns cached answer. Provider switch: `local` (zero infra, hashed 384d) or `google` (`text-embedding-004` 768d) or `openai`. Tracks hit rate by day.

**3. Tiered memory**

- Working: current turn, RAM only, 6k tokens
- Episodic: timestamped events in SQLite, importance-scored, compressed every 100 episodes, LRU eviction
- Semantic: distilled facts, deduped, pinned, recalled by query

Zero infra by default: single `memrie.db` via `bun:sqlite`. No Postgres, no Redis.

## Quick start (extractor)

```bash
curl -fsSL https://bun.sh/install | bash
export OPENAI_API_KEY=sk-xxx
bun scripts/extract.ts -m ./AGENTS.md -c ./conversation.txt
```

## Quick start (product)

```bash
bun install

# As library (any harness)
import { Memrie } from "./src/index.ts";
const memrie = new Memrie("./memrie.db");

// Context budgeting
const packet = memrie.buildContext({
  query: "What is my work?",
  memory: readFileSync("./AGENTS.md", "utf-8"),
  docs: [{ content: "doc text", source: "doc.md", score: 1 }],
  tools: [{ name: "search", description: "search docs" }],
  history: ["user: hello"],
});
// packet.prompt, packet.tokensUsed, packet.trimmed

// Cache
await memrie.cacheAnswer("hello world", "answer hello");
const hit = await memrie.cachedQuery("hello world"); // { hit: true, score: 1.0 }

// Tiered memory
memrie.working.add("user", "deploy failed");
memrie.episodic.add("raw event", "deployment success", 0.9);
memrie.semantic.add("Memrie is a memory product", "conversation");

// Stats
console.log(memrie.stats());
```

## HTTP sidecar (no npm stress, no Python required)

```bash
bun run src/server.ts
# or
PORT=3000 bun run src/server.ts
```

Endpoints:

- `POST /context/build` - dynamic context builder
- `POST /memory/working`, `GET /memory/working`
- `POST /memory/episodic`, `GET /memory/episodic?q=...`
- `POST /memory/semantic`, `GET /memory/semantic?q=...`
- `POST /cache/store`, `POST /cache/lookup`, `GET /cache/stats`
- `GET /stats`

Python harnesses call via `requests.post("http://localhost:3000/context/build", json={...})` - no npm at runtime. A thin `pip install memrie` can wrap the HTTP client later.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | For extraction | - |
| `OPENAI_BASE_URL` | Extraction endpoint | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Extraction model | `gpt-4o-mini` |
| `MEMRIE_EMBEDDER` | `local` or `google` or `openai` | `local` |
| `GOOGLE_API_KEY` | For Google embeddings | - |
| `MEMRIE_DB` | SQLite path | `./memrie.db` |

## Structure

```
## Work context
<1-2 sentences> ← Current project identity, dense nouns

## Personal context
<2-3 sentences> ← Communication style, preferences

## Top of mind
- <bullet> ← Active decisions (max 5)

## Brief history
<paragraphs> ← Recent months, detailed

## Earlier context  
<paragraphs> ← Past phases, compressed

## Long-term background
- <one-liner> ← Persistent traits
```

## Project layout

```
scripts/extract.ts      # Original extractor with 3k cap
src/
  tokens.ts             # 4-char estimator
  contextBuilder.ts     # Budgeted packing
  embedder/             # Local, Google, OpenAI
  cache/                # SQLite embedding cache + hit rate
  memory/               # Working, episodic, semantic
  server.ts             # Hono HTTP sidecar
  index.ts              # Unified Memrie class
```

## License

MIT
