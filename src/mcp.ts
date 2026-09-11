#!/usr/bin/env bun
/**
 * Memrie MCP Server - exposes Memrie as Model Context Protocol tools
 *
 * Any MCP client (Mastra, PydanticAI, Vercel AI SDK, OpenAI Agents SDK, Claude) sees:
 *   memrie_build_context
 *   memrie_cache_lookup / memrie_cache_store
 *   memrie_memory_add / memrie_memory_recall
 *   memrie_memory_working / memrie_episodic_add
 *
 * Run: memrie mcp  (stdio transport)
 * Or:  bun run src/mcp.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Memrie } from "./index.js";

const memrie = new Memrie(process.env.MEMRIE_DB || "./memrie.db");

const server = new Server(
  { name: "memrie", version: "0.2.3" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "memrie_build_context",
        description: "Build packed context within token budget from memory, docs, tools, history. Returns prompt ready for LLM.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Current user query" },
            memory: { type: "string", description: "AGENTS.md content" },
            docs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string" },
                  source: { type: "string" },
                  score: { type: "number" },
                },
                required: ["content", "source", "score"],
              },
            },
            tools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
            history: { type: "array", items: { type: "string" } },
            budget: {
              type: "object",
              properties: {
                total: { type: "number" },
                memory: { type: "number" },
                docs: { type: "number" },
              },
            },
          },
          required: ["query"],
        },
      },
      {
        name: "memrie_cache_lookup",
        description: "Lookup embedding cache for similar query. Returns cached answer if similarity >= threshold.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            threshold: { type: "number", description: "Cosine threshold, default 0.92" },
          },
          required: ["query"],
        },
      },
      {
        name: "memrie_cache_store",
        description: "Store query and answer in embedding cache for future hits.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            answer: { type: "string" },
          },
          required: ["query", "answer"],
        },
      },
      {
        name: "memrie_memory_add",
        description: "Add a distilled fact to semantic memory. Deduped and searchable.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Fact text" },
            source: { type: "string", description: "Source, e.g. conversation" },
          },
          required: ["text"],
        },
      },
      {
        name: "memrie_memory_recall",
        description: "Recall facts from semantic memory by query. Returns ranked facts.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
      {
        name: "memrie_episodic_add",
        description: "Add an episodic event with importance. Auto-evicts and compresses.",
        inputSchema: {
          type: "object",
          properties: {
            raw: { type: "string" },
            summary: { type: "string" },
            importance: { type: "number", description: "0-1, 0.9 for critical" },
          },
          required: ["raw"],
        },
      },
      {
        name: "memrie_working_add",
        description: "Add a turn to working memory (RAM, current conversation).",
        inputSchema: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant", "tool"] },
            content: { type: "string" },
          },
          required: ["content"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as any;

  try {
    if (name === "memrie_build_context") {
      const packet = memrie.buildContext(a);
      return { content: [{ type: "text", text: JSON.stringify(packet, null, 2) }] };
    }
    if (name === "memrie_cache_lookup") {
      const res = await memrie.cache.lookup(a.query, a.threshold);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
    if (name === "memrie_cache_store") {
      const entry = await memrie.cache.store(a.query, a.answer);
      return { content: [{ type: "text", text: JSON.stringify(entry, null, 2) }] };
    }
    if (name === "memrie_memory_add") {
      const id = memrie.semantic.add(a.text, a.source || "mcp");
      return { content: [{ type: "text", text: JSON.stringify({ id, text: a.text }, null, 2) }] };
    }
    if (name === "memrie_memory_recall") {
      const facts = memrie.semantic.recall(a.query, a.limit || 10);
      return { content: [{ type: "text", text: JSON.stringify(facts, null, 2) }] };
    }
    if (name === "memrie_episodic_add") {
      const id = memrie.episodic.add(a.raw, a.summary || a.raw.slice(0, 200), a.importance ?? 0.5);
      return { content: [{ type: "text", text: JSON.stringify({ id }, null, 2) }] };
    }
    if (name === "memrie_working_add") {
      memrie.working.add(a.role || "user", a.content);
      return { content: [{ type: "text", text: JSON.stringify({ working: memrie.working.all() }, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (e: any) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
