# Memrie

Think of Memrie as memory for your AI agent. It remembers what matters, forgets what does not, and makes sure every request fits inside the model's window.

Before Memrie, agents either cram everything and blow the token limit, or forget everything and start from zero. Memrie fixes that.

It works with any agent framework - LangChain, CrewAI, Vercel AI SDK, or your own harness - via a simple HTTP API. No npm stress. No Python rewrite.

Single file hard cap: 3,000 tokens for AGENTS.md (12,000 chars, 4-char principle).

## The three builds in plain language

### 1. Dynamic Context Builder - Packs just the right context every time

**In plain language:** Every time your agent gets a query, Memrie decides what to send to the model. It has a budget (e.g. 8,000 tokens) and splits it across memory, retrieved docs, tools, and chat history. If the budget is tight, it trims the least important parts first and tells you what was trimmed.

**Why it matters:** Without this, your agent either sends too much and errors, or sends too little and gives weak answers. With budgeting, you always stay under the limit and always send the most relevant pieces.

**Scenario:** You run a customer support agent. A user asks "Where is my order 4921?"

- Memory says: You are a support agent for ShopLite, you are helpful and concise
- Docs: 3 retrieved help articles (shipping, refunds, order lookup)
- Tools: 2 tools (lookupOrder, refundOrder)
- History: last 10 turns

Memrie packs them like this: memory first (so tone stays right), then the order lookup doc (most relevant), then tools, then recent history. If that is too many tokens, it drops the least relevant doc and the oldest history, and reports `trimmed: { docs: 1, history: 2 }`.

**Any framework:**

```js
import { Memrie } from "./src/index.ts";
const memrie = new Memrie("./memrie.db");
const packet = memrie.buildContext({
  query: "Where is my order 4921?",
  memory: readFileSync("./AGENTS.md", "utf-8"),
  docs: retrievedDocs, // [{ content, source, score }]
  tools: availableTools, // [{ name, description }]
  history: recentTurns,
});
// packet.prompt is ready to send to any LLM
// packet.tokensUsed, packet.trimmed tells you what was cut
```

Or via HTTP for Python:

```py
requests.post("http://localhost:3000/context/build", json={
  "query": "Where is my order 4921?",
  "memory": open("AGENTS.md").read(),
  "docs": docs,
  "tools": tools
})
```

### 2. Embedding Cache - Answers repeat questions instantly

**In plain language:** When someone asks a question you have answered before (or something very similar), Memrie returns the saved answer immediately without calling the LLM again. It understands meaning, not just exact words, because it compares embeddings. It also tracks how often the cache hits.

**Why it matters:** Saves money, saves time, and makes your agent faster. Common questions like "What is your refund policy?" get answered in milliseconds.

**Scenario:** You run a coding assistant. Three different users ask:

- "How do I debounce in JavaScript?"
- "Show me JS debounce example"
- "Debounce function in JS please"

These are the same intent. The first call goes to the LLM and is cached. The next two hit the cache (similarity > 0.92) and return instantly. Your dashboard at `GET /cache/stats` shows hitRate 66 percent for the day.

Provider switch: `local` for zero infra and zero cost (hashed 384d), `google` for better accuracy (`text-embedding-004`, 768d) with `GOOGLE_API_KEY`, `openai` as fallback.

**Any framework:**

```js
const hit = await memrie.cachedQuery("How do I debounce in JavaScript?");
if (hit.hit) return hit.answer; // instant

const answer = await callLLM(query);
await memrie.cacheAnswer(query, answer);
```

Via HTTP:

```bash
curl -X POST http://localhost:3000/cache/lookup -d '{"query":"How do I debounce in JS?"}'
curl -X POST http://localhost:3000/cache/store -d '{"query":"...","answer":"..."}'
curl http://localhost:3000/cache/stats # { hitRate: 0.66, totalEntries: 120 }
```

### 3. Tiered Memory - Three kinds of memory that behave like a human

**In plain language:** Memrie has three layers, like human memory.

- Working: what is happening right now in this conversation. Lives in RAM, 6,000 tokens, never saved to disk. Fast and temporary.

- Episodic: what happened in the past, with timestamps. Saved in SQLite. Example: "2026-09-10: User deployed v2.3 to Vercel, success." If you have 500 episodes, the oldest low-importance ones are compressed or evicted. Every 100 episodes, the oldest 10 are summarized into one.

- Semantic: distilled facts that are always true. Example: "User prefers direct answers with no fluff" or "Memrie is a memory product." Deduped, searchable by meaning, you can pin important ones so they are never evicted.

**Why it matters:** Most agents have one flat memory that either grows forever or gets wiped. Tiered memory keeps recent detail, long term knowledge, and instant context separate, with clear rules for when to compress and when to forget.

**Scenario:** Research agent helping a founder.

- Working: current turn - "User is asking about pricing for the third time, sounds frustrated"
- Episodic: last week - "Aug 28: User tested pricing at $29, got 2 percent conversion. Sep 02: User tested $49, got 1.1 percent."
- Semantic: pinned fact - "User is building Auxlo for SMBs, cares about shipping speed over polish"

When the user asks "What pricing should I try next?", Memrie recalls the semantic fact plus the two episodic pricing tests, and the model gives a grounded answer instead of guessing.

**Any framework:**

```js
// Working
memrie.working.add("user", "deploy failed with timeout");
memrie.working.all(); // current turn history
memrie.working.toPrompt();

// Episodic
memrie.episodic.add("raw event log", "deployment success on Vercel", 0.9);
memrie.episodic.recent(20);
memrie.episodic.search("deployment");

// Semantic
memrie.semantic.add("User prefers direct answers", "conversation");
memrie.semantic.recall("communication style"); // returns ranked facts
memrie.semantic.pin(id); // never evict
```

Via HTTP:

```bash
curl -X POST http://localhost:3000/memory/working -d '{"role":"user","content":"deploy failed"}'
curl -X POST http://localhost:3000/memory/episodic -d '{"raw":"...","summary":"...","importance":0.9}'
curl "http://localhost:3000/memory/semantic?q=pricing"
```

## Zero infra by design

Default is one file: `memrie.db` via SQLite.

No Postgres. No Redis. No Docker. SQLite plus sqlite-vec style search in plain JS works for up to tens of thousands of entries.

Want hosted scale later? Swap the DB path to Postgres plus pgvector. Same API.

## How it fits any harness

Memrie does not care what agent framework you use.

- **JS or TS harness** (Vercel AI SDK, LangChain.js, your own): `import { Memrie } from "memrie"` or call the HTTP sidecar.

- **Python harness** (LangChain, CrewAI, AutoGen): Run the sidecar once `memrie serve` then `requests.post("http://localhost:3000/context/build", json={...})`. No npm at runtime. A thin `pip install memrie` wrapper can be added later that just wraps the HTTP calls.

- **Any other language**: It is just HTTP JSON. `POST /context/build` works from Go, Rust, or curl.

## Install - multiple options

### Option 1: GitHub Releases (no npm, single binary - recommended)

```bash
# One-liner (detects OS/arch, installs to ~/.local/bin)
curl -fsSL https://raw.githubusercontent.com/emperormk01/Memrie/main/install.sh | bash

# Minimal (downloads to current dir)
curl -fsSL https://raw.githubusercontent.com/emperormk01/Memrie/main/get.sh | bash

# Direct binary (pick your platform)
curl -L https://github.com/emperormk01/Memrie/releases/latest/download/memrie-linux-x64 -o /usr/local/bin/memrie && chmod +x /usr/local/bin/memrie
# also: memrie-linux-arm64, memrie-darwin-x64, memrie-darwin-arm64
```

### Option 2: npm (for JS/TS harnesses)

```bash
npm install -g memrie-cli
# or without install
bunx memrie-cli --help
npx memrie-cli --help
# binary is still `memrie`
memrie --help
```

### Option 3: From source (dev)

```bash
git clone https://github.com/emperormk01/Memrie.git
cd Memrie
bun install
bun run src/cli.ts --help
```

## MCP server (for Mastra, PydanticAI, Vercel, OpenAI Agents, Claude)

Any MCP client sees Memrie as native tools. One process, 7 tools:

- `memrie_build_context` - packed prompt
- `memrie_cache_lookup` / `memrie_cache_store`
- `memrie_memory_add` / `memrie_memory_recall`
- `memrie_episodic_add` / `memrie_working_add`

```bash
memrie mcp
# stdio transport, no port needed
```

Config for your harness (Mastra, Claude Code, etc.):

```json
{
  "mcpServers": {
    "memrie": {
      "command": "memrie",
      "args": ["mcp"],
      "env": { "MEMRIE_DB": "./memrie.db" }
    }
  }
}
```

Or with Bun without install:

```json
{
  "mcpServers": {
    "memrie": {
      "command": "bun",
      "args": ["run", "/path/to/Memrie/src/mcp.ts"]
    }
  }
}
```

## Quick start - unified CLI `memrie this`, `memrie that`

```bash
memrie extract -m ./AGENTS.md -c ./chat.txt
memrie build --query "Where is my order?" --memory ./AGENTS.md
memrie cache store --query "hello" --answer "world"
memrie memory semantic --add "User prefers direct answers"
memrie serve --port 3000
memrie --help
```

### Extractor (turn conversations into AGENTS.md)

```bash
export OPENAI_API_KEY=sk-xxx
memrie extract -m ./AGENTS.md -c ./conversation.txt
# From URL
memrie extract -m ./AGENTS.md -u https://example.com/chat
```

### Product

```ts
// Library
import { Memrie } from "./src/index.ts";
const memrie = new Memrie("./memrie.db");
const packet = memrie.buildContext({ query, memory, docs, tools, history });
await memrie.cacheAnswer(query, answer);
memrie.semantic.add("fact", "source");

# HTTP sidecar
memrie serve # -> http://localhost:3000
```

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | For extraction | - |
| `OPENAI_BASE_URL` | Extraction endpoint | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Extraction model | `gpt-4o-mini` |
| `MEMRIE_EMBEDDER` | `local` or `google` or `openai` | `local` |
| `GOOGLE_API_KEY` | For Google embeddings | - |
| `MEMRIE_DB` | SQLite path | `./memrie.db` |
| `PORT` | Sidecar port | `3000` |

## Project layout

```
scripts/extract.ts      # AGENTS.md extractor with 3k cap
src/
  tokens.ts             # 4-char estimator
  contextBuilder.ts     # Budgeted packing
  embedder/             # Local, Google, OpenAI
  cache/                # SQLite cache + hit rate
  memory/               # Working, episodic, semantic
  server.ts             # Hono HTTP sidecar
  index.ts              # Unified Memrie class
```

## License

MIT
