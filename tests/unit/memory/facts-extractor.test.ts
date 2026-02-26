import { describe, expect, it } from "vitest";
import { extractFactCandidates } from "../../../src/memory/facts-extractor.js";

describe("extractFactCandidates", () => {
  it("extracts coding agent fact from explicit using statement", () => {
    const facts = extractFactCandidates("I am currently using codex not claude code.");
    const codingAgent = facts.find((fact) => fact.key === "preference.coding_agent");

    expect(codingAgent?.value).toBe("codex");
    expect((codingAgent?.confidence ?? 0) > 0.8).toBe(true);
  });

  it("extracts package manager and test framework from preference statement", () => {
    const facts = extractFactCandidates("I prefer npm and vitest for this project.");

    expect(facts.find((fact) => fact.key === "preference.package_manager")?.value).toBe("npm");
    expect(facts.find((fact) => fact.key === "preference.test_framework")?.value).toBe("vitest");
  });

  it("returns empty result for unrelated text", () => {
    const facts = extractFactCandidates("I reorganized a folder and updated a README.");
    expect(facts).toHaveLength(0);
  });
});
