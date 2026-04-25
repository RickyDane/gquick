import { plugins } from "../plugins";
import { PluginTool, ToolResult, ToolCall } from "../plugins/types";

export function getAllTools(): PluginTool[] {
  return plugins.flatMap((p) => p.tools ?? []);
}

export async function executeTool(
  name: string,
  args: Record<string, any>
): Promise<ToolResult> {
  const plugin = plugins.find((p) => p.tools?.some((t) => t.name === name));
  if (!plugin || !plugin.executeTool) {
    return { content: "", success: false, error: `Tool "${name}" not found` };
  }
  try {
    return await plugin.executeTool(name, args);
  } catch (err: any) {
    return { content: "", success: false, error: err.message || String(err) };
  }
}

export function convertToolsForProvider(
  tools: PluginTool[],
  provider: "openai" | "kimi" | "google" | "anthropic"
): any[] | any {
  if (provider === "openai" || provider === "kimi") {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  if (provider === "google") {
    return {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    };
  }

  if (provider === "anthropic") {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  return [];
}

// ------------------------------------------------------------------
// Provider-specific message conversion for tool-enabled chat history
// ------------------------------------------------------------------

interface ChatImage {
  dataUrl: string;
  mimeType: string;
  base64: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  images?: ChatImage[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export function convertMessagesToOpenAI(messages: Message[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return {
      role: m.role,
      content: m.images?.length
        ? [
            { type: "text", text: m.content },
            ...m.images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: img.dataUrl },
            })),
          ]
        : m.content,
    };
  });
}

export function convertMessagesToGemini(messages: Message[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      let toolName = "unknown";
      for (const msg of messages) {
        if (msg.role === "assistant" && msg.toolCalls) {
          const tc = msg.toolCalls.find((t) => t.id === m.toolCallId);
          if (tc) {
            toolName = tc.name;
            break;
          }
        }
      }
      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: { result: m.content },
            },
          },
        ],
      };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "model",
        parts: m.toolCalls.map((tc) => ({
          functionCall: { name: tc.name, args: tc.arguments },
        })),
      };
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        { text: m.content },
        ...(m.images?.map((img) => ({
          inlineData: { mimeType: img.mimeType, data: img.base64 },
        })) || []),
      ],
    };
  });
}

export function convertMessagesToAnthropic(messages: Message[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result" as const,
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const content: any[] = [];
      if (m.content) {
        content.push({ type: "text", text: m.content });
      }
      content.push(
        ...m.toolCalls.map((tc) => ({
          type: "tool_use" as const,
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        }))
      );
      return { role: "assistant", content };
    }
    return {
      role: m.role,
      content: m.images?.length
        ? [
            { type: "text", text: m.content },
            ...m.images.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mimeType,
                data: img.base64,
              },
            })),
          ]
        : m.content,
    };
  });
}
