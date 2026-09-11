import { Database } from "bun:sqlite";

export interface Episode {
  id: string;
  at: string;
  summary: string;
  raw: string;
  importance: number; // 0-1
}

export class EpisodicMemory {
  private db: Database;
  private maxEpisodes: number;

  constructor(dbPath = "./memrie.db", maxEpisodes = 500) {
    this.db = new Database(dbPath);
    this.maxEpisodes = maxEpisodes;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        summary TEXT NOT NULL,
        raw TEXT NOT NULL,
        importance REAL DEFAULT 0.5
      )
    `);
  }

  add(raw: string, summary: string, importance = 0.5) {
    const id = Bun.hash(raw + Date.now()).toString(16);
    this.db.run("INSERT INTO episodes(id, at, summary, raw, importance) VALUES(?,?,?,?,?)",
      [id, new Date().toISOString(), summary, raw, importance]);
    this.evictIfNeeded();
    return id;
  }

  // Compression: every N episodes, summarize oldest 10 into one
  compress(threshold = 100) {
    const count = (this.db.query("SELECT COUNT(*) as c FROM episodes").get() as any).c;
    if (count < threshold) return;
    const oldest = this.db.query("SELECT * FROM episodes ORDER BY at ASC LIMIT 10").all() as any[];
    const combined = oldest.map(e => e.summary).join(" | ");
    // simple compression: keep first sentence of each
    const compressed = combined.split(". ").slice(0, 5).join(". ") + ".";
    // delete oldest 10, insert compressed one
    for (const e of oldest) this.db.run("DELETE FROM episodes WHERE id = ?", [e.id]);
    this.add(compressed, `Compressed ${oldest.length} episodes: ${compressed}`, 0.3);
  }

  private evictIfNeeded() {
    const count = (this.db.query("SELECT COUNT(*) as c FROM episodes").get() as any).c;
    if (count <= this.maxEpisodes) return;
    // evict lowest importance + oldest
    this.db.run("DELETE FROM episodes WHERE id IN (SELECT id FROM episodes ORDER BY importance ASC, at ASC LIMIT ?)", [count - this.maxEpisodes]);
  }

  recent(limit = 20): Episode[] {
    return this.db.query("SELECT * FROM episodes ORDER BY at DESC LIMIT ?").all(limit) as any;
  }

  search(query: string, limit = 10): Episode[] {
    const q = `%${query}%`;
    return this.db.query("SELECT * FROM episodes WHERE summary LIKE ? OR raw LIKE ? ORDER BY at DESC LIMIT ?").all(q, q, limit) as any;
  }

  close() { this.db.close(); }
}
