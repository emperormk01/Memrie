// 4-char principle: 1 token ≈ 4 chars
export const TOKENS_PER_CHAR = 0.25;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateTokensForParts(parts: string[]): number {
  return estimateTokens(parts.join("\n"));
}

// Hard cap for AGENTS.md is 3000 tokens = 12000 chars (kept from extract.ts)
export const MAX_TOKENS_MEM = 3000;
export const MAX_CHARS_MEM = MAX_TOKENS_MEM * 4;
