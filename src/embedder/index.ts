// Provider-agnostic embedder: local hash fallback, Google, OpenAI

export interface Embedder {
  embed(text: string): Promise<number[]>;
  dims(): number;
}

// Simple local embedder for zero-infra demo: hashed bag-of-words -> 384 dims
// Not accurate, but works without API keys. Swap to Google/OpenAI when keys present.
export class LocalEmbedder implements Embedder {
  private d = 384;
  dims() { return this.d; }
  async embed(text: string): Promise<number[]> {
    const vec = new Array(this.d).fill(0);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    for (const tok of tokens) {
      let h = 0;
      for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
      const idx = h % this.d;
      vec[idx] += 1;
    }
    // L2 normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
  }
}

export class GoogleEmbedder implements Embedder {
  private d = 768;
  constructor(private apiKey: string, private model = "text-embedding-004") {}
  dims() { return this.d; }
  async embed(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: `models/${this.model}`, content: { parts: [{ text }] } }),
    });
    if (!res.ok) throw new Error(`Google embed ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const values = data.embedding?.values;
    if (!values) throw new Error("Google embed: no values");
    // normalize
    const norm = Math.sqrt(values.reduce((s: number, v: number) => s + v * v, 0)) || 1;
    return values.map((v: number) => v / norm);
  }
}

export class OpenAIEmbedder implements Embedder {
  private d = 1536;
  constructor(private apiKey: string, private baseUrl = "https://api.openai.com/v1", private model = "text-embedding-3-small") {}
  dims() { return this.d; }
  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!res.ok) throw new Error(`OpenAI embed ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const vec = data.data?.[0]?.embedding;
    if (!vec) throw new Error("OpenAI embed: no embedding");
    const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0)) || 1;
    return vec.map((v: number) => v / norm);
  }
}

export function createEmbedder(): Embedder {
  const kind = (process.env.MEMRIE_EMBEDDER || "local").toLowerCase();
  if (kind === "google" && process.env.GOOGLE_API_KEY) {
    return new GoogleEmbedder(process.env.GOOGLE_API_KEY, process.env.GOOGLE_EMBED_MODEL || "text-embedding-004");
  }
  if (kind === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIEmbedder(process.env.OPENAI_API_KEY, process.env.OPENAI_BASE_URL, process.env.OPENAI_MODEL_EMBED);
  }
  return new LocalEmbedder();
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i] * b[i];
  return dot; // already normalized
}
