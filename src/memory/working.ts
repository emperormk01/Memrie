// Working memory: current turn, lives in RAM, 4k-8k tokens, never persisted

export interface Turn {
  role: "user" | "assistant" | "tool";
  content: string;
  at: string;
}

export class WorkingMemory {
  private turns: Turn[] = [];
  private maxTokens: number;

  constructor(maxTokens = 6000) {
    this.maxTokens = maxTokens;
  }

  add(role: Turn["role"], content: string) {
    this.turns.push({ role, content, at: new Date().toISOString() });
    this.evictIfNeeded();
  }

  private tokens(text: string) { return Math.ceil(text.length / 4); }

  private evictIfNeeded() {
    let total = this.turns.reduce((s, t) => s + this.tokens(t.content), 0);
    while (total > this.maxTokens && this.turns.length > 1) {
      const removed = this.turns.shift()!;
      total -= this.tokens(removed.content);
    }
  }

  all(): Turn[] { return [...this.turns]; }
  clear() { this.turns = []; }
  toPrompt(): string { return this.turns.map(t => `${t.role}: ${t.content}`).join("\n"); }
}
