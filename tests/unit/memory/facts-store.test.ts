import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFactsStore } from "../../../src/memory/facts-store.js";

const testDbPath = path.join(process.cwd(), "sandbox", "test-temp", "facts-store.test.db");

afterEach(async () => {
  await fs.rm(path.dirname(testDbPath), { recursive: true, force: true });
});

describe("createFactsStore", () => {
  it("upserts and de-duplicates facts by fact key", () => {
    const store = createFactsStore({ dbPath: testDbPath, now: () => 1 });

    store.upsertFacts("conversation-1", "req-1", [
      {
        key: "preference.package_manager",
        value: "npm",
        confidence: 0.92,
        sourceExcerpt: "I prefer npm"
      }
    ]);

    store.upsertFacts("conversation-1", "req-2", [
      {
        key: "preference.package_manager",
        value: "npm",
        confidence: 0.8,
        sourceExcerpt: "still using npm"
      }
    ]);

    const facts = store.listFacts("conversation-1", 10);
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toBe("npm");
    expect(facts[0].confidence >= 0.9).toBe(true);
    store.close();
  });

  it("returns relevant facts for a query", () => {
    const store = createFactsStore({ dbPath: testDbPath, now: () => 2 });

    store.upsertFacts("conversation-1", "req-1", [
      {
        key: "preference.package_manager",
        value: "npm",
        confidence: 0.95,
        sourceExcerpt: "I prefer npm"
      },
      {
        key: "preference.coding_agent",
        value: "codex",
        confidence: 0.9,
        sourceExcerpt: "I am currently using codex"
      }
    ]);

    const relevant = store.getRelevantFacts("conversation-1", "what coding agent do i use", 5);
    expect(relevant[0]?.key).toBe("preference.coding_agent");

    const formatted = store.formatFactsContext(relevant);
    expect(formatted).toContain("coding agent: codex");
    store.close();
  });
});
