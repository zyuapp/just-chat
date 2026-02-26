import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { FactCandidate, FactRecord } from "./facts-types.js";
import { ensureDatabaseSchema } from "./bootstrap.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");
const DEFAULT_LIMIT = 8;
const FACT_CONFIDENCE_SCALE = 100;

type CreateFactsStoreOptions = {
  dbPath?: string;
  now?: () => number;
};

type FactsContext = {
  sqlite: Database.Database;
  now: () => number;
  selectExisting: Database.Statement<unknown[], RawFactRow>;
  insertFact: Database.Statement;
  updateFact: Database.Statement;
  selectFacts: Database.Statement<unknown[], RawFactRow>;
};

type RawFactRow = {
  id: string;
  fact_key: string;
  value: string;
  value_normalized: string;
  confidence: number;
  source_request_id: string;
  source_excerpt: string;
  created_at: number;
  updated_at: number;
};

export type FactsStore = {
  upsertFacts: (conversationId: string, requestId: string, candidates: FactCandidate[]) => void;
  listFacts: (conversationId: string, limit?: number) => FactRecord[];
  getRelevantFacts: (conversationId: string, query: string, limit?: number) => FactRecord[];
  formatFactsContext: (facts: FactRecord[]) => string | null;
  close: () => void;
};

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function toStoredConfidence(confidence: number): number {
  const clamped = Math.min(1, Math.max(0, confidence));
  return Math.round(clamped * FACT_CONFIDENCE_SCALE);
}

function fromStoredConfidence(confidence: number): number {
  return confidence / FACT_CONFIDENCE_SCALE;
}

function queryTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function lexicalOverlapScore(tokens: string[], text: string): number {
  if (tokens.length === 0) {
    return 0;
  }

  const haystack = new Set(queryTokens(text));
  let hits = 0;

  for (const token of tokens) {
    if (haystack.has(token)) {
      hits += 1;
    }
  }

  return hits / tokens.length;
}

function labelForFactKey(key: string): string {
  const labels: Record<string, string> = {
    "preference.package_manager": "package manager",
    "preference.test_framework": "test framework",
    "preference.coding_agent": "coding agent",
    "preference.language": "language"
  };

  return labels[key] ?? key;
}

function toFactRecord(row: RawFactRow): FactRecord {
  return {
    id: row.id,
    key: row.fact_key,
    value: row.value,
    confidence: fromStoredConfidence(row.confidence),
    sourceRequestId: row.source_request_id,
    sourceExcerpt: row.source_excerpt,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mergeConfidence(existing: number, incoming: number): number {
  return Math.max(existing, Math.round(existing * 0.8 + incoming * 0.2));
}

function shouldReplaceValue(existing: RawFactRow, incomingValueNormalized: string, incomingConfidence: number): boolean {
  if (existing.value_normalized === incomingValueNormalized) {
    return true;
  }

  return incomingConfidence >= existing.confidence;
}

function createSqlite(dbPath: string): Database.Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  ensureDatabaseSchema(sqlite);
  return sqlite;
}

function rankFactsForQuery(facts: FactRecord[], query: string): FactRecord[] {
  const tokens = queryTokens(query);
  const broadPreferenceQuery = /(prefer|preference|use|using|remember|stack|setup)/i.test(query);

  const scored = facts.map((fact) => {
    const overlap = Math.max(
      lexicalOverlapScore(tokens, fact.key),
      lexicalOverlapScore(tokens, fact.value),
      lexicalOverlapScore(tokens, fact.sourceExcerpt)
    );

    const score = fact.confidence + overlap * 0.6 + (broadPreferenceQuery ? 0.05 : 0);
    return { fact, score };
  });

  return scored.sort((a, b) => b.score - a.score).map((item) => item.fact);
}

function createFactsContext(options: CreateFactsStoreOptions): FactsContext {
  const sqlite = createSqlite(options.dbPath ?? DEFAULT_DB_PATH);

  return {
    sqlite,
    now: options.now ?? Date.now,
    selectExisting: sqlite.prepare<unknown[], RawFactRow>(
      `SELECT * FROM facts WHERE conversation_id = ? AND fact_key = ? LIMIT 1`
    ),
    insertFact: sqlite.prepare(
      `INSERT INTO facts (
        id, conversation_id, fact_key, value, value_normalized, confidence,
        source_request_id, source_excerpt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    updateFact: sqlite.prepare(
      `UPDATE facts
       SET value = ?, value_normalized = ?, confidence = ?, source_request_id = ?, source_excerpt = ?, updated_at = ?
       WHERE id = ?`
    ),
    selectFacts: sqlite.prepare<unknown[], RawFactRow>(
      `SELECT * FROM facts WHERE conversation_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
  };
}

function upsertFacts(context: FactsContext, conversationId: string, requestId: string, candidates: FactCandidate[]): void {
  const timestamp = context.now();

  for (const candidate of candidates) {
    const normalized = normalizeValue(candidate.value);
    const incomingConfidence = toStoredConfidence(candidate.confidence);
    const existing = context.selectExisting.get(conversationId, candidate.key);

    if (!existing) {
      context.insertFact.run(
        randomUUID(),
        conversationId,
        candidate.key,
        candidate.value,
        normalized,
        incomingConfidence,
        requestId,
        candidate.sourceExcerpt,
        timestamp,
        timestamp
      );
      continue;
    }

    if (!shouldReplaceValue(existing, normalized, incomingConfidence)) {
      continue;
    }

    context.updateFact.run(
      candidate.value,
      normalized,
      mergeConfidence(existing.confidence, incomingConfidence),
      requestId,
      candidate.sourceExcerpt,
      timestamp,
      existing.id
    );
  }
}

function listFacts(context: FactsContext, conversationId: string, limit = DEFAULT_LIMIT): FactRecord[] {
  const rows = context.selectFacts.all(conversationId, limit);
  return rows.map(toFactRecord);
}

function getRelevantFacts(
  context: FactsContext,
  conversationId: string,
  query: string,
  limit = DEFAULT_LIMIT
): FactRecord[] {
  const facts = listFacts(context, conversationId, 200);

  if (facts.length === 0) {
    return [];
  }

  return rankFactsForQuery(facts, query).slice(0, limit);
}

function formatFactsContext(facts: FactRecord[]): string | null {
  if (facts.length === 0) {
    return null;
  }

  const lines = facts.map(
    (fact) => `- ${labelForFactKey(fact.key)}: ${fact.value} (confidence=${fact.confidence.toFixed(2)})`
  );

  return [
    "Known durable facts about the user:",
    ...lines,
    "Treat these facts as stable unless the user explicitly updates them."
  ].join("\n");
}

export function createFactsStore(options: CreateFactsStoreOptions = {}): FactsStore {
  const context = createFactsContext(options);

  return {
    upsertFacts: (conversationId, requestId, candidates) =>
      upsertFacts(context, conversationId, requestId, candidates),
    listFacts: (conversationId, limit) => listFacts(context, conversationId, limit),
    getRelevantFacts: (conversationId, query, limit) =>
      getRelevantFacts(context, conversationId, query, limit),
    formatFactsContext,
    close: () => context.sqlite.close()
  };
}
