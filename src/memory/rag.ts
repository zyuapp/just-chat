import type { Logger } from "pino";
import type { MemoryChunkRecord, MemoryStore } from "./store.js";

const MIN_CHUNK_CHARS = 30;
const CHUNK_SIZE_CHARS = 500;
const CHUNK_OVERLAP_CHARS = 100;
const MAX_MEMORY_CANDIDATES = 500;
const DEFAULT_TOP_K = 5;
const MIN_SIMILARITY_SCORE = 0.1;

export type EmbeddingClient = {
  embed: (request: { model: string; input: string | string[] }) => Promise<{ embeddings: number[][] }>;
};

type RagMemoryOptions = {
  memory: MemoryStore;
  embedClient: EmbeddingClient;
  logger: Logger;
  embedModel: string;
};

type IngestMessageInput = {
  conversationId: string;
  requestId: string;
  role: "user" | "assistant" | "tool";
  content: string;
};

type RetrievedMemory = {
  score: number;
  content: string;
  sourceRole: string;
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function chunkText(content: string): string[] {
  const normalized = normalizeWhitespace(content);
  if (normalized.length < MIN_CHUNK_CHARS) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, normalized.length);
    const chunk = normalized.slice(start, end).trim();

    if (chunk.length >= MIN_CHUNK_CHARS) {
      chunks.push(chunk);
    }

    if (end === normalized.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }

  return chunks;
}

function vectorMagnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return -1;
  }

  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }

  const denominator = vectorMagnitude(a) * vectorMagnitude(b);
  if (denominator === 0) {
    return -1;
  }

  return dot / denominator;
}

function trimMemorySnippet(content: string): string {
  if (content.length <= 220) {
    return content;
  }

  return `${content.slice(0, 220)}...`;
}

function rankMemoryCandidates(
  candidates: MemoryChunkRecord[],
  queryEmbedding: number[],
  topK: number
): RetrievedMemory[] {
  const ranked = candidates
    .map((candidate) => ({
      score: cosineSimilarity(queryEmbedding, candidate.embedding),
      content: candidate.content,
      sourceRole: candidate.sourceRole
    }))
    .filter((item) => item.score >= MIN_SIMILARITY_SCORE)
    .sort((a, b) => b.score - a.score);

  const selected: RetrievedMemory[] = [];
  const seen = new Set<string>();

  for (const item of ranked) {
    if (selected.length >= topK) {
      break;
    }

    const dedupeKey = item.content.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    selected.push(item);
  }

  return selected;
}

function tokenize(text: string): string[] {
  return normalizeWhitespace(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function lexicalScore(queryTokens: string[], content: string): number {
  if (queryTokens.length === 0) {
    return 0;
  }

  const contentTokens = new Set(tokenize(content));
  let hitCount = 0;

  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      hitCount += 1;
    }
  }

  return hitCount / queryTokens.length;
}

function rankLexicalFallback(
  candidates: MemoryChunkRecord[],
  normalizedQuery: string,
  topK: number
): RetrievedMemory[] {
  const queryTokens = tokenize(normalizedQuery);

  return candidates
    .map((candidate) => ({
      score: lexicalScore(queryTokens, candidate.content),
      content: candidate.content,
      sourceRole: candidate.sourceRole
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function formatRetrievedContext(memories: RetrievedMemory[]): string | null {
  if (memories.length === 0) {
    return null;
  }

  const lines = memories.map(
    (item) => `- (${item.sourceRole}) ${trimMemorySnippet(item.content)} [score=${item.score.toFixed(2)}]`
  );

  return [
    "Relevant prior context retrieved from long-term memory:",
    ...lines,
    "Use these as hints when helpful, but prefer the most current user request."
  ].join("\n");
}

function saveChunksWithoutEmbeddings(
  memory: MemoryStore,
  input: IngestMessageInput,
  chunks: string[]
): void {
  for (const chunk of chunks) {
    memory.saveMemoryChunk({
      conversationId: input.conversationId,
      requestId: input.requestId,
      sourceRole: input.role,
      content: chunk,
      embedding: []
    });
  }
}

function selectRetrievedMemories(
  candidates: MemoryChunkRecord[],
  queryEmbedding: number[],
  normalizedQuery: string,
  topK: number
): { retrieved: RetrievedMemory[]; strategy: "semantic" | "lexical_fallback" } {
  const semanticRetrieved = rankMemoryCandidates(candidates, queryEmbedding, topK);

  if (semanticRetrieved.length > 0) {
    return { retrieved: semanticRetrieved, strategy: "semantic" };
  }

  return {
    retrieved: rankLexicalFallback(candidates, normalizedQuery, topK),
    strategy: "lexical_fallback"
  };
}

export function createRagMemory({ memory, embedClient, logger, embedModel }: RagMemoryOptions) {
  async function ingestMessage(input: IngestMessageInput): Promise<void> {
    const chunks = chunkText(input.content);
    if (chunks.length === 0) {
      return;
    }

    try {
      const response = await embedClient.embed({ model: embedModel, input: chunks });

      for (let i = 0; i < chunks.length; i += 1) {
        const embedding = response.embeddings[i];
        if (!embedding) {
          continue;
        }

        memory.saveMemoryChunk({
          conversationId: input.conversationId,
          requestId: input.requestId,
          sourceRole: input.role,
          content: chunks[i],
          embedding
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown embedding error";
      logger.warn({ event: "memory_ingest_error", requestId: input.requestId, message });
      saveChunksWithoutEmbeddings(memory, input, chunks);
    }
  }

  async function retrieveContext(conversationId: string, query: string, topK = DEFAULT_TOP_K): Promise<string | null> {
    const normalizedQuery = normalizeWhitespace(query);
    if (normalizedQuery.length < MIN_CHUNK_CHARS) {
      return null;
    }

    const candidates = memory.listRecentMemoryChunks(conversationId, MAX_MEMORY_CANDIDATES);
    if (candidates.length === 0) {
      return null;
    }

    try {
      const response = await embedClient.embed({ model: embedModel, input: normalizedQuery });
      const queryEmbedding = response.embeddings[0] ?? [];
      const { retrieved, strategy } = selectRetrievedMemories(
        candidates,
        queryEmbedding,
        normalizedQuery,
        topK
      );

      logger.info({
        event: "memory_retrieval",
        queryLength: normalizedQuery.length,
        candidateCount: candidates.length,
        hitCount: retrieved.length,
        strategy
      });

      return formatRetrievedContext(retrieved);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown retrieval error";
      logger.warn({ event: "memory_retrieval_error", message });

      const fallback = rankLexicalFallback(candidates, normalizedQuery, topK);
      return formatRetrievedContext(fallback);
    }
  }

  return {
    ingestMessage,
    retrieveContext
  };
}
