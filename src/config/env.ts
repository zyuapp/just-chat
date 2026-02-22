import { z } from "zod";

const envSchema = z.object({
  OLLAMA_API_KEY: z.string().min(1, "OLLAMA_API_KEY is required"),
  OLLAMA_MODEL: z.string().min(1, "OLLAMA_MODEL is required"),
  OLLAMA_HOST: z.string().url("OLLAMA_HOST must be a valid URL")
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(inputEnv: Record<string, string | undefined> = process.env): AppEnv {
  const parsedEnv = envSchema.safeParse(inputEnv);

  if (!parsedEnv.success) {
    const details = parsedEnv.error.issues
      .map((issue) => `- ${issue.message}`)
      .join("\n");

    throw new Error(
      `Missing or invalid environment variables:\n${details}\n\nCopy .env.example to .env and update values.`
    );
  }

  return parsedEnv.data;
}
