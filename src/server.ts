import { Hono } from "hono";
import { Memrie } from "./index.js";

const memrie = new Memrie(process.env.MEMRIE_DB || "./memrie.db");
const app = new Hono();

// Health
app.get("/", c => c.json({ name: "Memrie", version: "0.2.0", status: "online" }));

// Dynamic context builder
app.post("/context/build", async c => {
  const body = await c.req.json();
  const packet = memrie.buildContext(body);
  return c.json(packet);
});

// Memory tiers
app.post("/memory/working", async c => {
  const { role, content } = await c.req.json();
  memrie.working.add(role || "user", content);
  return c.json({ ok: true, working: memrie.working.all() });
});
app.get("/memory/working", c => c.json(memrie.working.all()));

app.post("/memory/episodic", async c => {
  const { raw, summary, importance } = await c.req.json();
  const id = memrie.episodic.add(raw, summary || raw.slice(0, 200), importance);
  return c.json({ ok: true, id });
});
app.get("/memory/episodic", c => {
  const q = c.req.query("q");
  const data = q ? memrie.episodic.search(q) : memrie.episodic.recent(20);
  return c.json(data);
});

app.post("/memory/semantic", async c => {
  const { text, source } = await c.req.json();
  const id = memrie.semantic.add(text, source);
  return c.json({ ok: true, id });
});
app.get("/memory/semantic", c => {
  const q = c.req.query("q");
  const data = q ? memrie.semantic.recall(q) : memrie.semantic.all();
  return c.json(data);
});

// Embedding cache
app.post("/cache/lookup", async c => {
  const { query, threshold } = await c.req.json();
  const res = await memrie.cache.lookup(query, threshold);
  return c.json(res);
});
app.post("/cache/store", async c => {
  const { query, answer } = await c.req.json();
  const entry = await memrie.cache.store(query, answer);
  return c.json(entry);
});
app.get("/cache/stats", c => c.json(memrie.cache.stats()));

// Stats
app.get("/stats", c => c.json(memrie.stats()));

export default app;

// Only auto-serve when run directly, not when imported
if (import.meta.main) {
  const port = Number(process.env.PORT || 3000);
  console.log(`Memrie listening on http://localhost:${port}`);
  Bun.serve({ port, fetch: app.fetch });
}
