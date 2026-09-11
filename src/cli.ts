#!/usr/bin/env bun
/**
 * Memrie unified CLI - `memrie this`, `memrie that`
 *
 * Usage:
 *   memrie extract -m ./AGENTS.md -c ./chat.txt
 *   memrie build --query "hello" --memory ./AGENTS.md
 *   memrie cache store --query "hello" --answer "world"
 *   memrie cache lookup --query "hello"
 *   memrie cache stats
 *   memrie memory working --add "deploy failed"
 *   memrie memory episodic --add "deployment success"
 *   memrie memory semantic --add "User prefers direct answers"
 *   memrie serve
 *   memrie --help
 */

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

function help() {
  console.log(`
Memrie - memory for any agent harness

Usage:
  memrie <command> [options]

Commands:
  extract                 Turn conversations into AGENTS.md (wraps scripts/extract.ts)
    -m, --memory <file>     Path to AGENTS.md
    -c, --conversation <file> Path to conversation file
    -t, --text <text>       Raw conversation text
    -u, --url <url>         URL to fetch conversation from

  build                   Build packed context within token budget
    --query <text>          Current query (required)
    --memory <file>         Path to AGENTS.md
    --docs <file>           Path to docs JSON [{content, source, score}]
    --tools <file>          Path to tools JSON [{name, description}]
    --budget <json>         Budget JSON e.g. '{"total":8000,"memory":3000}'

  cache                   Embedding cache
    cache store --query <q> --answer <a>
    cache lookup --query <q>
    cache stats

  memory                  Tiered memory
    memory working [--add <text>] [--list]
    memory episodic [--add <text>] [--search <q>] [--list]
    memory semantic [--add <text>] [--search <q>] [--list] [--pin <id>]

  serve                   Start HTTP sidecar
    --port <port>           Port (default 3000)
    --db <path>             SQLite path (default ./memrie.db)

  mcp                     Start MCP server (stdio) for Mastra, PydanticAI, etc.

  --help, -h              Show this help
  --version, -v           Show version

Examples:
  memrie extract -m ./AGENTS.md -c ./chat.txt
  memrie build --query "Where is my order?" --memory ./AGENTS.md
  memrie cache store --query "How to debounce?" --answer "Use setTimeout..."
  memrie memory semantic --add "User prefers direct answers"
  memrie serve --port 3000
  memrie mcp
`);
}

function getFlag(flag: string, fallback = ""): string {
  const idx = rest.indexOf(flag);
  if (idx !== -1 && rest[idx + 1]) return rest[idx + 1];
  // also support --flag=value
  const pref = rest.find(a => a.startsWith(flag + "="));
  if (pref) return pref.split("=")[1];
  return fallback;
}

async function runExtract() {
  // Forward all args to scripts/extract.ts via bun
  const proc = spawn("bun", ["run", "scripts/extract.ts", ...rest], { stdio: "inherit" });
  proc.on("exit", code => process.exit(code ?? 0));
}

async function runBuild() {
  const { readFileSync } = await import("node:fs");
  const { Memrie } = await import("./index.ts");
  const query = getFlag("--query") || getFlag("-q");
  if (!query) { console.error("build: --query is required"); process.exit(1); }
  const memPath = getFlag("--memory") || getFlag("-m");
  let memory = "";
  if (memPath) {
    try { memory = readFileSync(memPath, "utf-8"); } catch {}
  }
  const docsPath = getFlag("--docs");
  let docs: any[] = [];
  if (docsPath) {
    try { docs = JSON.parse(readFileSync(docsPath, "utf-8")); } catch (e: any) { console.error(`Failed to read docs: ${e.message}`); }
  }
  const toolsPath = getFlag("--tools");
  let tools: any[] = [];
  if (toolsPath) {
    try { tools = JSON.parse(readFileSync(toolsPath, "utf-8")); } catch (e: any) { console.error(`Failed to read tools: ${e.message}`); }
  }
  const budgetStr = getFlag("--budget");
  let budget: any = undefined;
  if (budgetStr) {
    try { budget = JSON.parse(budgetStr); } catch (e: any) { console.error(`Invalid budget JSON: ${e.message}`); }
  }
  const memrie = new Memrie(process.env.MEMRIE_DB || "./memrie.db");
  const packet = memrie.buildContext({ query, memory, docs, tools, budget });
  console.log(JSON.stringify(packet, null, 2));
}

async function runCache() {
  const { Memrie } = await import("./index.ts");
  const memrie = new Memrie(process.env.MEMRIE_DB || "./memrie.db");
  const sub = rest[0];
  if (sub === "store") {
    const q = getFlag("--query") || getFlag("-q");
    const a = getFlag("--answer") || getFlag("-a");
    if (!q || !a) { console.error("cache store: --query and --answer required"); process.exit(1); }
    const entry = await memrie.cache.store(q, a);
    console.log(JSON.stringify(entry, null, 2));
  } else if (sub === "lookup") {
    const q = getFlag("--query") || getFlag("-q");
    if (!q) { console.error("cache lookup: --query required"); process.exit(1); }
    const res = await memrie.cache.lookup(q);
    console.log(JSON.stringify(res, null, 2));
  } else if (sub === "stats") {
    console.log(JSON.stringify(memrie.cache.stats(), null, 2));
  } else {
    console.error("cache: use store, lookup, or stats");
    process.exit(1);
  }
}

async function runMemory() {
  const { Memrie } = await import("./index.ts");
  const memrie = new Memrie(process.env.MEMRIE_DB || "./memrie.db");
  const tier = rest[0]; // working, episodic, semantic
  const add = getFlag("--add");
  const search = getFlag("--search") || getFlag("-q");
  const list = rest.includes("--list");
  const pin = getFlag("--pin");

  if (tier === "working") {
    if (add) memrie.working.add("user", add);
    if (add || list || !search) console.log(JSON.stringify(memrie.working.all(), null, 2));
    else console.log(JSON.stringify(memrie.working.all(), null, 2));
  } else if (tier === "episodic") {
    if (add) {
      const id = memrie.episodic.add(add, add.slice(0, 200), 0.5);
      console.log(JSON.stringify({ id }, null, 2));
    }
    if (search) console.log(JSON.stringify(memrie.episodic.search(search), null, 2));
    else if (list || !add) console.log(JSON.stringify(memrie.episodic.recent(20), null, 2));
  } else if (tier === "semantic") {
    if (add) {
      const id = memrie.semantic.add(add, "cli");
      console.log(JSON.stringify({ id }, null, 2));
    }
    if (pin) { memrie.semantic.pin(pin, 1); console.log(JSON.stringify({ pinned: pin }, null, 2)); }
    if (search) console.log(JSON.stringify(memrie.semantic.recall(search), null, 2));
    else if (list || !add) console.log(JSON.stringify(memrie.semantic.all(), null, 2));
  } else {
    console.error("memory: use working, episodic, or semantic");
    process.exit(1);
  }
}

async function runServe() {
  const port = getFlag("--port") || process.env.PORT || "3000";
  const db = getFlag("--db") || process.env.MEMRIE_DB || "./memrie.db";
  process.env.PORT = port;
  process.env.MEMRIE_DB = db;
  console.log(`Starting Memrie sidecar on http://localhost:${port} (db: ${db})`);
  await import("./server.ts");
}

async function runMcp() {
  await import("./mcp.ts");
}

async function main() {
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") return help();
  if (cmd === "--version" || cmd === "-v") {
    const pkg = await import("../package.json", { with: { type: "json" } } as any).catch(() => ({ default: { version: "0.2.0" } }));
    console.log(pkg.default.version || "0.2.0");
    return;
  }
  if (cmd === "extract") return runExtract();
  if (cmd === "build" || cmd === "context") return runBuild();
  if (cmd === "cache") return runCache();
  if (cmd === "memory") return runMemory();
  if (cmd === "serve") return runServe();
  if (cmd === "mcp") return runMcp();
  console.error(`Unknown command: ${cmd}`);
  help();
  process.exit(1);
}

main();
