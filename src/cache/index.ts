import { Database } from "bun:sqlite";
import { createEmbedder, cosine } from "../embedder/index.js";
import type { Embedder } from "../embedder/index.js";

export interface CacheEntry {
  id: string;
  query: string;
  answer: string;
  embedding: number[];
  hits: number;
  createdAt: string;
  lastHit: string;
}

const SIMILARITY_THRESHOLD = 0.92;
const DEFAULT_TTL_DAYS = 7;

export class EmbeddingCache {
  private db: Database;
  private embedder: Embedder;

  constructor(dbPath = "./memrie.db", embedder?: Embedder) {
    this.db = new Database(dbPath);
    this.embedder = embedder || createEmbedder();
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        answer TEXT NOT NULL,
        embedding TEXT NOT NULL,
        hits INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_hit TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache_stats (
        day TEXT PRIMARY KEY,
        hits INTEGER DEFAULT 0,
        misses INTEGER DEFAULT 0
      )
    `);
  }

  async lookup(query: string, threshold = SIMILARITY_THRESHOLD): Promise<{ hit: boolean; entry?: CacheEntry; score?: number }> {
    const qEmb = await this.embedder.embed(query);
    const rows = this.db.query("SELECT * FROM cache").all() as any[];
    let best: any = null;
    let bestScore = -1;
    for (const r of rows) {
      const emb: number[] = JSON.parse(r.embedding);
      // handle dim mismatch (Google 768 vs local 384) -> skip if dims differ
      if (emb.length !== qEmb.length) continue;
      const score = cosine(qEmb, emb);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    const day = new Date().toISOString().slice(0, 10);
    if (best && bestScore >= threshold) {
      this.db.run("UPDATE cache SET hits = hits + 1, last_hit = ? WHERE id = ?", [new Date().toISOString(), best.id]);
      this.db.run("INSERT OR IGNORE INTO cache_stats(day, hits, misses) VALUES(?,0,0)", [day]);
      this.db.run("UPDATE cache_stats SET hits = hits + 1 WHERE day = ?", [day]);
      return {
        hit: true,
        score: bestScore,
        entry: {
          id: best.id,
          query: best.query,
          answer: best.answer,
          embedding: JSON.parse(best.embedding),
          hits: best.hits + 1,
          createdAt: best.created_at,
          lastHit: new Date().toISOString(),
        },
      };
    }
    this.db.run("INSERT OR IGNORE INTO cache_stats(day, hits, misses) VALUES(?,0,0)", [day]);
    this.db.run("UPDATE cache_stats SET misses = misses + 1 WHERE day = ?", [day]);
    return { hit: false, score: bestScore };
  }

  async store(query: string, answer: string, ttlDays = DEFAULT_TTL_DAYS): Promise<CacheEntry> {
    const emb = await this.embedder.embed(query);
    const id = Bun.hash(query + answer).toString(16);
    const now = new Date().toISOString();
    this.db.run(
      "INSERT OR REPLACE INTO cache(id, query, answer, embedding, hits, created_at, last_hit) VALUES(?,?,?,?,?,?,?)",
      [id, query, answer, JSON.stringify(emb), 0, now, now]
    );
    return { id, query, answer, embedding: emb, hits: 0, createdAt: now, lastHit: now };
  }

  stats() {
    const rows = this.db.query("SELECT * FROM cache_stats ORDER BY day DESC LIMIT 30").all() as any[];
    const total = this.db.query("SELECT COUNT(*) as c, SUM(hits) as h FROM cache").get() as any;
    const hitRate = rows.length
      ? rows.reduce((s, r) => s + r.hits, 0) / Math.max(1, rows.reduce((s, r) => s + r.hits + r.misses, 0))
      : 0;
    return { totalEntries: total.c, totalHits: total.h || 0, byDay: rows, hitRate };
  }

  evictExpired(ttlDays = DEFAULT_TTL_DAYS) {
    const cutoff = new Date(Date.now() - ttlDays * 86400000).toISOString();
    this.db.run("DELETE FROM cache WHERE last_hit < ?", [cutoff]);
  }

  close() { this.db.close(); }
}
