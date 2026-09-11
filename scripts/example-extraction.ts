/**
 * EXAMPLE: Manual Memory Extraction
 * 
 * This demonstrates the extraction prompt format.
 * In production, this calls a smaller model via API.
 * 
 * Run: bun example-extraction.ts
 */

const CONVERSATION_SAMPLE = `
User: I'm building Auxlo, an AI agent orchestration platform. Targeting developers and SMBs.
User: I need model routing across OpenAI, Anthropic, Google, and some smaller providers.
User: The voice agent architecture uses Gemini 2.5 Flash Native Audio.
User: I'm frustrated with how long this infrastructure setup is taking.
User: Also I do freelance work - building AI agents for clients.
User: I prefer direct communication, no fluff. Just give me the technical details.
User: Benchmarks show MiniMax M2.7 is competitive with GPT-4o on some tasks.
User: Subscription to Midjourney ($10/mo), Runway ($15/mo), Gemini Pro ($20/mo).
User: Decided to use WebSocket-to-telephony bridging for voice agent.
User: Background is in writing, combining that with AI agent-building as a service.
`;

const EXTRACTION_PROMPT = `You are a memory extraction system. Extract information from the conversation and structure it.

CONVERSATION:
${CONVERSATION_SAMPLE}

OUTPUT FORMAT:
## Work context
<1-2 sentences describing current project identity - dense nouns, no fluff>

## Personal context  
<2-3 sentences on communication style and preferences - brief attributes only>

## Top of mind
- <active decision or concern>
- <open question>
- <blocking issue>
(max 5 bullets)

## Brief history
<paragraphs for recent work - detailed, grouped by theme>

## Earlier context
<past phases - compressed, thematic>

## Long-term background
- <persistent trait or background interest>
- <another persistent trait>
(one-liners)

COMPRESSION RULES:
- Work context: Dense nouns only, "X is building Y for Z"
- Personal context: No examples, just attributes
- Top of mind: What's active NOW, not historical
- Brief history: Recent months, preserve detail
- Earlier context: Past phases, compress heavily  
- Long-term background: Stable traits that persist`;

console.log("=== EXTRACTION PROMPT ===\n");
console.log(EXTRACTION_PROMPT);
console.log("\n=== EXPECTED OUTPUT ===\n");

const EXPECTED_OUTPUT = `## Work context
Mayo King is building Auxlo (auxlo.xyz), an AI agent orchestration and automation platform targeting developers and SMBs. The project involves model routing across multiple AI providers, agentic pipelines, client audit generation, and workflow automation.

## Personal context
Mayo King communicates in a direct, casual style with no fluff, preferring concise technical responses. He values actionable information over explanations and dislikes unnecessary formatting.

## Top of mind
- Model routing infrastructure setup taking longer than expected
- Voice agent architecture using Gemini 2.5 Flash Native Audio with WebSocket-to-telephony bridging
- MiniMax M2.7 benchmark results competitive with GPT-4o on some tasks
- Subscription costs across providers (Midjourney, Runway, Gemini Pro)

## Brief history
Mayo King built and tested a white-labeled AI agent (Rico) for a client, iteratively hardening system prompts to prevent infrastructure leaks. He designed a voice agent architecture using Gemini 2.5 Flash Native Audio with WebSocket-to-telephony bridging, navigating geographic restrictions. He's been running systematic benchmarks across providers (MiniMax M2.7 vs GPT-4o, etc.) and managing subscription costs across multiple AI services.

## Earlier context
Mayo King has done freelance/client work building AI-powered products, combining his writing background with technical AI development as a service offering.

## Long-term background
- Background combining writing skills with AI agent-building
- Interest in AI model evaluation and infrastructure
- Freelance development work including platforms for Ghanaian market`;

console.log(EXPECTED_OUTPUT);
