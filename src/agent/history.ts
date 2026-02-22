import type { Message } from "ollama";

const SYSTEM_PROMPT =
  "You are a concise local coding assistant. Keep answers practical and direct. Use tools when needed.";

export function createInitialHistory(): Message[] {
  return [
    {
      role: "system",
      content: SYSTEM_PROMPT
    }
  ];
}

export function appendAssistantReply(history: Message[], message: Message): string {
  const assistantText = message.content.trim();
  history.push({ role: "assistant", content: assistantText });
  return assistantText;
}
