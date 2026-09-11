import { estimateTokens } from "./tokens.js";

export interface ContextBudget {
  /** Total context window for the model (e.g. 128000) */
  total: number;
  /** Reserved for system prompt */
  system?: number;
  /** Reserved for tools definitions */
  tools?: number;
  /** Budget for memory (AGENTS.md etc) */
  memory?: number;
  /** Budget for retrieved docs */
  docs?: number;
  /** Budget for working history */
  history?: number;
}

export interface BuildInput {
  query: string;
  memory?: string; // full AGENTS.md text
  docs?: Array<{ content: string; source: string; score: number }>;
  tools?: Array<{ name: string; description: string; schema?: any }>;
  history?: string[]; // recent messages
  budget?: Partial<ContextBudget>;
}

export interface ContextPacket {
  prompt: string;
  tokensUsed: number;
  tokensBudget: number;
  trimmed: { docs: number; history: number; memoryTrimmed: boolean };
  trace: string[];
}

const DEFAULT_BUDGET: ContextBudget = {
  total: 8000,
  system: 500,
  tools: 1500,
  memory: 3000,
  docs: 2400,
  history: 600,
};

function fitText(text: string, budgetTokens: number): string {
  const tokens = estimateTokens(text);
  if (tokens <= budgetTokens) return text;
  const maxChars = budgetTokens * 4;
  return text.slice(0, maxChars) + "\n[...trimmed to fit budget...]";
}

export function buildContext(input: BuildInput): ContextPacket {
  const b: ContextBudget = { ...DEFAULT_BUDGET, ...input.budget };
  const trace: string[] = [];
  let trimmedDocs = 0;
  let trimmedHistory = 0;
  let memoryTrimmed = false;

  // Tools block
  let toolsBlock = "";
  if (input.tools?.length) {
    toolsBlock = input.tools.map(t => `- ${t.name}: ${t.description}`).join("\n");
    const before = toolsBlock;
    toolsBlock = fitText(toolsBlock, b.tools!);
    if (toolsBlock !== before) trace.push("tools trimmed");
  }

  // Memory block with hard cap 3k enforced
  let memoryBlock = input.memory || "";
  const memTokens = estimateTokens(memoryBlock);
  if (memTokens > b.memory!) {
    memoryBlock = fitText(memoryBlock, b.memory!);
    memoryTrimmed = true;
    trace.push(`memory trimmed ${memTokens} -> ${b.memory} tokens`);
  }

  // Docs sorted by score, packed until budget fills
  let docsBlock = "";
  if (input.docs?.length) {
    const sorted = [...input.docs].sort((a, b) => b.score - a.score);
    let used = 0;
    const picked: typeof sorted = [];
    for (const d of sorted) {
      const t = estimateTokens(d.content);
      if (used + t <= b.docs!) {
        picked.push(d);
        used += t;
      } else {
        trimmedDocs++;
      }
    }
    docsBlock = picked.map(d => `Source: ${d.source}\n${d.content}`).join("\n\n---\n\n");
    if (trimmedDocs) trace.push(`docs: ${picked.length} kept, ${trimmedDocs} dropped over budget`);
  }

  // History packed from most recent backwards
  let historyBlock = "";
  if (input.history?.length) {
    let used = 0;
    const picked: string[] = [];
    for (let i = input.history.length - 1; i >= 0; i--) {
      const t = estimateTokens(input.history[i]);
      if (used + t <= b.history!) {
        picked.unshift(input.history[i]);
        used += t;
      } else {
        trimmedHistory++;
      }
    }
    historyBlock = picked.join("\n");
    if (trimmedHistory) trace.push(`history: ${picked.length} kept, ${trimmedHistory} dropped`);
  }

  const parts = [
    memoryBlock ? `## Memory\n${memoryBlock}` : "",
    docsBlock ? `## Retrieved Docs\n${docsBlock}` : "",
    toolsBlock ? `## Available Tools\n${toolsBlock}` : "",
    historyBlock ? `## Conversation History\n${historyBlock}` : "",
    `## Current Query\n${input.query}`,
  ].filter(Boolean);

  const prompt = parts.join("\n\n");
  const tokensUsed = estimateTokens(prompt);
  trace.push(`prompt ${tokensUsed}/${b.total} tokens`);

  return {
    prompt,
    tokensUsed,
    tokensBudget: b.total,
    trimmed: { docs: trimmedDocs, history: trimmedHistory, memoryTrimmed },
    trace,
  };
}
