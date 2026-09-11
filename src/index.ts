export * from "./tokens.js";
export * from "./contextBuilder.js";
export * from "./cache/index.js";
export * from "./embedder/index.js";
export * from "./memory/working.js";
export * from "./memory/episodic.js";
export * from "./memory/semantic.js";

// Unified Memrie product class for any harness
import { buildContext, type BuildInput, type ContextPacket } from "./contextBuilder.js";
import { EmbeddingCache } from "./cache/index.js";
import { WorkingMemory } from "./memory/working.js";
import { EpisodicMemory } from "./memory/episodic.js";
import { SemanticMemory } from "./memory/semantic.js";

export class Memrie {
  working: WorkingMemory;
  episodic: EpisodicMemory;
  semantic: SemanticMemory;
  cache: EmbeddingCache;

  constructor(dbPath = "./memrie.db") {
    this.working = new WorkingMemory();
    this.episodic = new EpisodicMemory(dbPath);
    this.semantic = new SemanticMemory(dbPath);
    this.cache = new EmbeddingCache(dbPath);
  }

  buildContext(input: BuildInput): ContextPacket {
    // auto-inject semantic recall based on query
    const facts = this.semantic.recall(input.query, 5);
    const factBlock = facts.map(f => `- ${f.text}`).join("\n");
    const memory = [input.memory || "", factBlock ? `## Recalled facts\n${factBlock}` : ""].filter(Boolean).join("\n\n");
    return buildContext({ ...input, memory });
  }

  async cachedQuery(query: string): Promise<{ hit: boolean; answer?: string; score?: number }> {
    const res = await this.cache.lookup(query);
    if (res.hit) return { hit: true, answer: res.entry!.answer, score: res.score };
    return { hit: false, score: res.score };
  }

  async cacheAnswer(query: string, answer: string) {
    return this.cache.store(query, answer);
  }

  stats() {
    return { cache: this.cache.stats(), episodic: this.episodic.recent(5), semantic: this.semantic.all(5) };
  }
}
