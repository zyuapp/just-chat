import type { ChatResponse, Message, Tool, ToolCall } from "ollama";
import { appendAssistantReply } from "./history.js";

const MAX_TOOL_LOOP_STEPS = 5;

export type AgentTurnResult =
  | {
      kind: "success";
      text: string;
    }
  | {
      kind: "error";
      text: string;
    };

export type ToolExecutor = (toolCall: ToolCall) => Promise<unknown>;

export type ChatClient = {
  chat: (params: {
    model: string;
    messages: Message[];
    tools?: Tool[];
    stream: false;
  }) => Promise<ChatResponse>;
};

type HandleUserMessageParams = {
  client: ChatClient;
  model: string;
  history: Message[];
  userInput: string;
  tools: Tool[];
  executeToolCall: ToolExecutor;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function handleUserMessage({
  client,
  model,
  history,
  userInput,
  tools,
  executeToolCall
}: HandleUserMessageParams): Promise<AgentTurnResult> {
  history.push({ role: "user", content: userInput });

  try {
    let response = await client.chat({
      model,
      messages: history,
      tools,
      stream: false
    });

    for (let step = 0; step < MAX_TOOL_LOOP_STEPS; step += 1) {
      const toolCalls = response.message.tool_calls ?? [];

      if (toolCalls.length === 0) {
        const assistantText = appendAssistantReply(history, response.message);
        return { kind: "success", text: assistantText };
      }

      history.push(response.message);

      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(toolCall);
        history.push({
          role: "tool",
          tool_name: toolCall.function.name,
          content: JSON.stringify(toolResult)
        });
      }

      response = await client.chat({
        model,
        messages: history,
        tools,
        stream: false
      });
    }

    const fallbackResponse = await client.chat({
      model,
      messages: history,
      stream: false
    });

    const assistantText = appendAssistantReply(history, fallbackResponse.message);
    return { kind: "success", text: assistantText };
  } catch (error) {
    return { kind: "error", text: getErrorMessage(error) };
  }
}
