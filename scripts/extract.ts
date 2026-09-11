#!/usr/bin/env bun
/**
 * Memrie - Memory Extraction
 * 
 * Extracts and compresses conversation context into structured AGENTS.md memory blocks.
 * Works with any OpenAI-compatible chat completions endpoint.
 * 
 * Usage:
 *   bun extract.ts --memory ./AGENTS.md --conversation ./chat.txt
 *   bun extract.ts --memory ./AGENTS.md --text "conversation text"
 *   bun extract.ts --url https://example.com/chat
 * 
 * Environment variables (or pass via flags):
 *   OPENAI_API_KEY      - Your API key
 *   OPENAI_BASE_URL     - Base URL for API
 *   OPENAI_MODEL        - Model name
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

// Default configuration - can be overridden via env vars or CLI flags
const DEFAULT_API_KEY = process.env.OPENAI_API_KEY || "";
const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_MAX_CHARS = 50000; // Max characters before truncation

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    memory: { type: "string", short: "m", default: "./AGENTS.md" },
    conversation: { type: "string", short: "c", default: "" },
    text: { type: "string", short: "t", default: "" },
    url: { type: "string", short: "u", default: "" },
    output: { type: "string", short: "o", default: "" },
    "api-key": { type: "string", default: "" },
    "base-url": { type: "string", default: "" },
    model: { type: "string", default: "" },
    "max-chars": { type: "string", default: String(DEFAULT_MAX_CHARS) },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositional: true,
});

if (values.help) {
  console.log(`
Memory Extraction - Extract structured memory from conversations

USAGE:
  bun extract.ts [OPTIONS]

OPTIONS:
  -m, --memory <file>       Path to AGENTS.md (default: ./AGENTS.md)
  -c, --conversation <file>  Path to conversation file
  -t, --text <text>         Raw conversation text
  -u, --url <url>           URL to fetch conversation from
  -o, --output <file>       Output file (default: update memory file)
  --api-key <key>           API key (or OPENAI_API_KEY env)
  --base-url <url>          API base URL (or OPENAI_BASE_URL env)
  --model <model>           Model name (or OPENAI_MODEL env)
  -h, --help                Show this help

EXAMPLES:
  # Extract from file
  bun extract.ts -m ./AGENTS.md -c ./chat.txt

  # Extract from URL
  bun extract.ts -m ./AGENTS.md -u https://example.com/chats/xxx

  # Use custom endpoint
  OPENAI_BASE_URL=https://api.groq.com/openai/v1 \\
    bun extract.ts -m ./AGENTS.md -c ./chat.txt
`);
  process.exit(0);
}

// Configuration
const API_KEY = values["api-key"] || process.env.OPENAI_API_KEY || DEFAULT_API_KEY;
const BASE_URL = values["base-url"] || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
const MODEL = values.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
const MAX_CHARS = parseInt(values["max-chars"] || String(DEFAULT_MAX_CHARS));

// Truncate conversation if too large
function truncateConversation(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  
  console.error(`Truncating conversation from ${text.length} to ${MAX_CHARS} chars...`);
  const truncated = text.slice(-MAX_CHARS);
  return "[...conversation truncated to last portion...]\n\n" + truncated;
}

interface MemoryBlock {
  workContext: string;
  personalContext: string;
  topOfMind: string[];
  briefHistory: string[];
  earlierContext: string[];
  longTermBackground: string[];
}

// Normalize content before parsing: lowercase headers, strip extra #
function normalizeMemory(content: string): string {
  return content
    // Normalize header levels (### or #### -> ##)
    .replace(/^#{3,}\s*/gm, "## ")
    // Normalize whitespace around headers
    .replace(/^##\s+/gm, "## ")
    // Lowercase header text for matching
    .replace(/^## [A-Z]/gm, (m) => m.toLowerCase())
    // Strip trailing whitespace
    .replace(/[ \t]+$/gm, "")
    // Normalize multiple blank lines to double
    .replace(/\n{3,}/g, "\n\n");
}

function parseMemory(content: string): MemoryBlock {
  // Normalize first
  const normalized = normalizeMemory(content);
  
  const sections: MemoryBlock = {
    workContext: "",
    personalContext: "",
    topOfMind: [],
    briefHistory: [],
    earlierContext: [],
    longTermBackground: [],
  };

  const workMatch = normalized.match(/## work context\n([\s\S]*?)(?=\n## |$)/i);
  const personalMatch = normalized.match(/## personal context\n([\s\S]*?)(?=\n## |$)/i);
  const topMatch = normalized.match(/## top of mind\n([\s\S]*?)(?=\n## |$)/i);
  const briefMatch = normalized.match(/## brief history\n([\s\S]*?)(?=\n## |$)/i);
  const earlierMatch = normalized.match(/## earlier context\n([\s\S]*?)(?=\n## |$)/i);
  const longMatch = normalized.match(/## long[- ]?term background\n([\s\S]*?)(?=\n## |$)/i);

  if (workMatch) sections.workContext = workMatch[1].trim();
  if (personalMatch) sections.personalContext = personalMatch[1].trim();
  if (topMatch) sections.topOfMind = topMatch[1].split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*]\s*/, ""));
  if (briefMatch) sections.briefHistory = briefMatch[1].split("\n\n").filter(l => l.trim());
  if (earlierMatch) sections.earlierContext = earlierMatch[1].split("\n\n").filter(l => l.trim());
  if (longMatch) sections.longTermBackground = longMatch[1].split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*]\s*/, ""));

  return sections;
}

function validateMemory(block: MemoryBlock): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!block.workContext.trim()) missing.push("work context");
  if (!block.personalContext.trim()) missing.push("personal context");
  if (block.topOfMind.length === 0) missing.push("top of mind");
  if (block.briefHistory.length === 0) missing.push("brief history");
  if (block.longTermBackground.length === 0) missing.push("long-term background");
  
  return { valid: missing.length === 0, missing };
}

function formatMemory(block: MemoryBlock): string {
  let output = `## Work context\n${block.workContext}\n\n`;
  output += `## Personal context\n${block.personalContext}\n\n`;
  output += `## Top of mind\n${block.topOfMind.map(i => `- ${i}`).join("\n")}\n\n`;
  output += `## Brief history\n${block.briefHistory.join("\n\n")}\n\n`;
  output += `## Earlier context\n${block.earlierContext.join("\n\n")}\n\n`;
  output += `## Long-term background\n${block.longTermBackground.map(i => `- ${i}`).join("\n")}\n`;
  return output;
}

async function callLLM(prompt: string, maxTokens: number = 3000): Promise<string> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

async function extractMemory(conversationText: string, existingMemory: MemoryBlock): Promise<MemoryBlock> {
  const hasExisting = existingMemory.workContext.length > 0;

  // STEP 1: Extract new facts from conversation only
  const extractionPrompt = `Extract ONLY NEW facts from this conversation that are NOT already in existing memory.

EXISTING MEMORY (do NOT repeat these facts):
${hasExisting ? formatMemory(existingMemory) : "(no existing memory)"}

OUTPUT FORMAT:
## New facts
- <fact 1 - ONLY facts not already in existing memory>
- <fact 2>
...

## New top of mind
- <new active concern not already tracked>
...

## Resolved items
- <items to remove from top of mind>
...

RULES:
1. DO NOT extract facts already in existing memory - check carefully
2. Only extract genuinely NEW information
3. Be specific: names, URLs, decisions, outcomes
4. Dense noun phrases, no conversational filler
5. If all facts are already known, output "## New facts\n(none)"

CONVERSATION:
${conversationText}

OUTPUT:`;

  const newFactsRaw = await callLLM(extractionPrompt);

  // Parse new facts
  const newFactsMatch = newFactsRaw.match(/## New facts\n([\s\S]*?)(?=\n## |$)/);
  const newTopMatch = newFactsRaw.match(/## New top of mind\n([\s\S]*?)(?=\n## |$)/);
  const resolvedMatch = newFactsRaw.match(/## Resolved items\n([\s\S]*?)(?=\n## |$)/);

  const newFacts = newFactsMatch ? newFactsMatch[1].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.replace(/^-\s*/, "")) : [];
  const newTopOfMind = newTopMatch ? newTopMatch[1].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.replace(/^-\s*/, "")) : [];
  const resolvedItems = resolvedMatch ? resolvedMatch[1].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.replace(/^-\s*/, "")) : [];

  // STEP 2: If no existing memory, create new
  if (!hasExisting) {
    const createPrompt = `Create a memory block from these extracted facts.

OUTPUT FORMAT (exact structure):
## Work context
<1-2 sentences with dense nouns describing project/work identity>

## Personal context
<2-3 sentences about communication style, preferences>

## Top of mind
- <bullet for active decisions, open questions>
- <max 5 bullets>

## Brief history
<paragraphs describing recent work, grouped by theme>

## Earlier context
<past phases, compressed, thematic>

## Long-term background
- <one-liner per persistent trait or background interest>

NEW FACTS:
${newFacts.join("\n")}

${newTopOfMind.length > 0 ? "NEW TOP OF MIND:\n" + newTopOfMind.join("\n") : ""}

OUTPUT:`;

    const result = await callLLM(createPrompt);
    return parseMemory(result);
  }

  // STEP 3: Merge with existing memory (use 12k tokens for large merges)
  const existingStr = formatMemory(existingMemory);

  const mergePrompt = `Merge the new facts into the existing memory and output the result.

EXISTING MEMORY:
${existingStr}

NEW FACTS TO ADD:
${newFacts.length > 0 ? newFacts.map(f => `- ${f}`).join("\n") : "(none)"}

NEW TOP OF MIND ITEMS:
${newTopOfMind.length > 0 ? newTopOfMind.map(i => `- ${i}`).join("\n") : "(none)"}

RESOLVED (REMOVE FROM TOP OF MIND):
${resolvedItems.length > 0 ? resolvedItems.map(i => `- ${i}`).join("\n") : "(none)"}

MERGE RULES:
- Work context: COMBINE if multiple active projects (list both), REPLACE if same project
- Personal context: PRESERVE existing, ADD new preferences only
- Top of mind: Keep max 5 items, remove resolved, add new important ones
- Brief history: Move OLD brief history to Earlier context, put NEW facts as new Brief history
- Earlier context: Compress and group by theme
- Long-term background: Keep all existing, add new traits only if truly new

DEDUPLICATION RULES (CRITICAL):
- Check ALL sections for duplicate or semantically overlapping facts
- If a fact appears in both existing AND new: keep the MORE DETAILED version, discard the other
- If a fact in Brief history overlaps with Earlier context: keep in Brief only if it has NEW information, otherwise discard
- Remove near-duplicates (same fact phrased differently)
- Do NOT let the same facts accumulate across multiple paragraphs in Brief history

Output the complete merged memory starting with "## Work context":`;

  const mergedResult = await callLLM(mergePrompt, 12000);
  return parseMemory(mergedResult);
}

async function fetchUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return await response.text();
}

async function main() {
  let conversationText = values.text;
  let memoryPath = values.memory;

  // Get conversation from file, URL, or direct text
  if (values.conversation) {
    conversationText = readFileSync(values.conversation, "utf-8");
  } else if (values.url) {
    console.error(`Fetching ${values.url}...`);
    conversationText = await fetchUrl(values.url);
  }

  if (!conversationText) {
    console.error("Error: No conversation provided. Use -c, -t, or -u.");
    process.exit(1);
  }

  // Truncate if too large
  conversationText = truncateConversation(conversationText);

  // Read existing memory if it exists
  let existingMemory: MemoryBlock = {
    workContext: "",
    personalContext: "",
    topOfMind: [],
    briefHistory: [],
    earlierContext: [],
    longTermBackground: [],
  };

  if (existsSync(memoryPath)) {
    const existing = readFileSync(memoryPath, "utf-8");
    existingMemory = parseMemory(existing);
  }

  console.error(`Extracting memory using ${MODEL}...`);
  console.error(`Endpoint: ${BASE_URL}`);

  // Extract and compress with validation loop (max 3 retries)
  let updatedMemory: MemoryBlock | null = null;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    updatedMemory = await extractMemory(conversationText, existingMemory);
    
    const validation = validateMemory(updatedMemory);
    
    if (validation.valid) {
      console.error(`Validation passed on attempt ${attempt}`);
      break;
    }
    
    console.error(`Validation failed on attempt ${attempt}: missing sections: ${validation.missing.join(", ")}`);
    
    if (attempt < MAX_RETRIES) {
      console.error("Retrying...");
    } else {
      console.error("Max retries reached. Aborting to prevent memory corruption.");
      console.error("The LLM returned malformed output and could not produce valid memory.");
      process.exit(1);
    }
  }

  if (!updatedMemory) {
    console.error("Error: No memory produced.");
    process.exit(1);
  }

  // Format output
  const output = formatMemory(updatedMemory);

  // Write to file or stdout
  if (values.output) {
    writeFileSync(values.output, output);
    console.error(`Memory written to ${values.output}`);
  } else {
    writeFileSync(memoryPath, output);
    console.error(`Memory updated in ${memoryPath}`);
  }

  console.log(output);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
