import { describe, expect, it } from "vitest";
import { getEnv } from "../../../src/config/env.js";

describe("getEnv", () => {
  it("returns parsed env values when valid", () => {
    const env = getEnv({
      OLLAMA_API_KEY: "test-key",
      OLLAMA_MODEL: "gpt-oss:120b",
      OLLAMA_HOST: "https://ollama.com"
    });

    expect(env.OLLAMA_API_KEY).toBe("test-key");
    expect(env.OLLAMA_MODEL).toBe("gpt-oss:120b");
    expect(env.OLLAMA_HOST).toBe("https://ollama.com");
    expect(env.OLLAMA_EMBED_MODEL).toBe("gpt-oss:120b");
  });

  it("uses explicit embed model when provided", () => {
    const env = getEnv({
      OLLAMA_API_KEY: "test-key",
      OLLAMA_MODEL: "gpt-oss:120b",
      OLLAMA_HOST: "https://ollama.com",
      OLLAMA_EMBED_MODEL: "nomic-embed-text"
    });

    expect(env.OLLAMA_EMBED_MODEL).toBe("nomic-embed-text");
  });

  it("throws with a clear message when required vars are missing", () => {
    expect(() => getEnv({ OLLAMA_API_KEY: "", OLLAMA_MODEL: "", OLLAMA_HOST: "" })).toThrow(
      "Missing or invalid environment variables"
    );
  });

  it("throws when host is not a valid URL", () => {
    expect(() =>
      getEnv({
        OLLAMA_API_KEY: "test-key",
        OLLAMA_MODEL: "gpt-oss:120b",
        OLLAMA_HOST: "not-a-url"
      })
    ).toThrow("OLLAMA_HOST must be a valid URL");
  });
});
