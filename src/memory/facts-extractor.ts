import type { FactCandidate } from "./facts-types.js";

const MAX_SOURCE_EXCERPT_CHARS = 220;

const FACT_KEY_PACKAGE_MANAGER = "preference.package_manager";
const FACT_KEY_TEST_FRAMEWORK = "preference.test_framework";
const FACT_KEY_CODING_AGENT = "preference.coding_agent";
const FACT_KEY_LANGUAGE = "preference.language";

const FACT_LEXICONS: Record<string, string[]> = {
  [FACT_KEY_PACKAGE_MANAGER]: ["pnpm", "npm", "yarn", "bun"],
  [FACT_KEY_TEST_FRAMEWORK]: ["vitest", "jest", "mocha", "ava"],
  [FACT_KEY_CODING_AGENT]: ["claude code", "codex", "cursor", "copilot", "windsurf", "openclaw"],
  [FACT_KEY_LANGUAGE]: ["typescript", "javascript", "python", "go", "rust"]
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeValue(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function buildSourceExcerpt(text: string): string {
  const normalized = normalizeWhitespace(text);

  if (normalized.length <= MAX_SOURCE_EXCERPT_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_SOURCE_EXCERPT_CHARS)}...`;
}

function findEarliestMatch(segmentLower: string, candidates: string[]): string | null {
  let bestValue: string | null = null;
  let bestIndex = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const index = segmentLower.indexOf(candidate);
    if (index < 0 || index >= bestIndex) {
      continue;
    }

    bestIndex = index;
    bestValue = candidate;
  }

  return bestValue;
}

function createCandidate(key: string, value: string, confidence: number, sourceExcerpt: string): FactCandidate {
  return {
    key,
    value: normalizeValue(value),
    confidence,
    sourceExcerpt
  };
}

function extractLexiconCandidates(segment: string, confidence: number, sourceExcerpt: string): FactCandidate[] {
  const segmentLower = segment.toLowerCase();
  const candidates: FactCandidate[] = [];

  for (const [key, lexicon] of Object.entries(FACT_LEXICONS)) {
    const matched = findEarliestMatch(segmentLower, lexicon);
    if (!matched) {
      continue;
    }

    candidates.push(createCandidate(key, matched, confidence, sourceExcerpt));
  }

  return candidates;
}

function extractPreferCandidates(text: string, sourceExcerpt: string): FactCandidate[] {
  const preferMatch = text.match(/\bi\s+prefer\s+([^.!?\n]+)/i);

  if (!preferMatch?.[1]) {
    return [];
  }

  return extractLexiconCandidates(preferMatch[1], 0.92, sourceExcerpt);
}

function extractUsingCandidates(text: string, sourceExcerpt: string): FactCandidate[] {
  const usingMatch = text.match(/\bi\s+(?:am|'m)\s+(?:currently\s+)?using\s+([^.!?\n]+)/i);

  if (!usingMatch?.[1]) {
    return [];
  }

  const agent = findEarliestMatch(usingMatch[1].toLowerCase(), FACT_LEXICONS[FACT_KEY_CODING_AGENT]);
  if (!agent) {
    return [];
  }

  return [createCandidate(FACT_KEY_CODING_AGENT, agent, 0.94, sourceExcerpt)];
}

function extractPackageManagerCandidates(text: string, sourceExcerpt: string): FactCandidate[] {
  const packageManagerMatch = text.match(/\bmy\s+preferred\s+package\s+manager\s+is\s+([a-z0-9 ._-]+)/i);

  if (!packageManagerMatch?.[1]) {
    return [];
  }

  const manager = findEarliestMatch(packageManagerMatch[1].toLowerCase(), FACT_LEXICONS[FACT_KEY_PACKAGE_MANAGER]);
  if (!manager) {
    return [];
  }

  return [createCandidate(FACT_KEY_PACKAGE_MANAGER, manager, 0.96, sourceExcerpt)];
}

function extractTestFrameworkCandidates(text: string, sourceExcerpt: string): FactCandidate[] {
  const testsMatch = text.match(/\bi\s+use\s+([a-z0-9 ._-]+)\s+for\s+tests?/i);

  if (!testsMatch?.[1]) {
    return [];
  }

  const framework = findEarliestMatch(testsMatch[1].toLowerCase(), FACT_LEXICONS[FACT_KEY_TEST_FRAMEWORK]);
  if (!framework) {
    return [];
  }

  return [createCandidate(FACT_KEY_TEST_FRAMEWORK, framework, 0.9, sourceExcerpt)];
}

function extractRegexCandidates(text: string, sourceExcerpt: string): FactCandidate[] {
  return [
    ...extractPreferCandidates(text, sourceExcerpt),
    ...extractUsingCandidates(text, sourceExcerpt),
    ...extractPackageManagerCandidates(text, sourceExcerpt),
    ...extractTestFrameworkCandidates(text, sourceExcerpt)
  ];
}

function dedupeCandidates(candidates: FactCandidate[]): FactCandidate[] {
  const bestByKey = new Map<string, FactCandidate>();

  for (const candidate of candidates) {
    const current = bestByKey.get(candidate.key);
    if (!current || candidate.confidence > current.confidence) {
      bestByKey.set(candidate.key, candidate);
    }
  }

  return [...bestByKey.values()];
}

export function extractFactCandidates(text: string): FactCandidate[] {
  const sourceExcerpt = buildSourceExcerpt(text);
  const fromRegex = extractRegexCandidates(text, sourceExcerpt);
  const fromLexicon = extractLexiconCandidates(text, 0.72, sourceExcerpt);
  return dedupeCandidates([...fromRegex, ...fromLexicon]);
}
