import { Database } from "bun:sqlite";

export interface Fact {
  id: string;
  text: string;
  source: string;
  createdAt: string;
  recallCount: number;
  pinned: number; // 0/1
}

export class SemanticMemory {
  private db: Database;

  constructor(dbPath = "./memrie.db") {
    this.db = new Database(dbPath);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        recall_count INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0
      )
    `);
  }

  add(text: string, source = "conversation"): string {
    // dedup by normalized text
    const norm = text.trim().toLowerCase();
    const existing = this.db.query("SELECT * FROM facts WHERE lower(text) = ?").get(norm) as any;
    if (existing) {
      this.db.run("UPDATE facts SET recall_count = recall_count + 1 WHERE id = ?", [existing.id]);
      return existing.id;
    }
    const id = Bun.hash(text).toString(16);
    this.db.run("INSERT INTO facts(id, text, source, created_at, recall_count, pinned) VALUES(?,?,?,?,?,?)",
      [id, text, source, new Date().toISOString(), 1, 0]);
    return id;
  }

  recall(query: string, limit = 10): Fact[] {
    const q = `%${query}%`;
    const rows = this.db.query("SELECT * FROM facts WHERE text LIKE ? ORDER BY pinned DESC, recall_count DESC LIMIT ?").all(q, limit) as any[];
    // bump recall count for returned
    for (const r of rows) this.db.run("UPDATE facts SET recall_count = recall_count + 1 WHERE id = ?", [r.id]);
    return rows.map(r => ({ id: r.id, text: r.text, source: r.source, createdAt: r.created_at, recallCount: r.recall_count + 1, pinned: r.pinned }));
  }

  all(limit = 100): Fact[] {
    return this.db.query("SELECT * FROM facts ORDER BY pinned DESC, recall_count DESC LIMIT ?").all(limit) as any[];
  }

  pin(id: string, pinned = 1) { this.db.run("UPDATE facts SET pinned = ? WHERE id = ?", [pinned, id]); }

  // Promotion: if episodic fact survived 3 recalls, promote to semantic is caller responsibility
  // Eviction: LRU by recall count, never evict pinned
  evict(keep = 500) {
    const count = (this.db.query("SELECT COUNT(*) as c FROM facts WHERE pinned = 0").get() as any).c;
    if (count <= keep) return;
    this.db.run("DELETE FROM facts WHERE id IN (SELECT id FROM facts WHERE pinned = 0 ORDER BY recall_count ASC, created_at ASC LIMIT ?)", [count - keep]);
  }

  close() { this.db.close(); }
}
