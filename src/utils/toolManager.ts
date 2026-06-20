import { plugins } from "../plugins";
import { PluginTool, ToolResult, ToolCall } from "../plugins/types";

export function getAllTools(): PluginTool[] {
  const all = plugins.flatMap((p) => p.tools ?? []);
  return all.filter((t) => {
    const isDefaultDisabled = t.name === "execute_python" || t.name === "execute_sql";
    const saved = localStorage.getItem(`tool-enabled-${t.name}`);
    if (saved === null) {
      return !isDefaultDisabled;
    }
    return saved === "true";
  });
}

export async function executeTool(
  name: string,
  args: Record<string, any>
): Promise<ToolResult> {
  // Strip "functions." prefix if present
  let cleanName = name.startsWith("functions.") ? name.substring(10) : name;
  
  // Map common/older aliases to clean tool names
  if (cleanName === "query_network_info") {
    cleanName = "get_network_info";
  } else if (cleanName === "search_web") {
    cleanName = "web_search";
  }

  const plugin = plugins.find((p) => p.tools?.some((t) => t.name === cleanName));
  if (!plugin || !plugin.executeTool) {
    const error = `Tool "${cleanName}" not found`;
    return { content: `Tool failed: ${error}`, success: false, error };
  }

  // Safety check: verify the tool is actually enabled
  const isDefaultDisabled = cleanName === "execute_python" || cleanName === "execute_sql";
  const saved = localStorage.getItem(`tool-enabled-${cleanName}`);
  const isEnabled = saved === null ? !isDefaultDisabled : saved === "true";
  if (!isEnabled) {
    const error = `Tool "${cleanName}" is disabled in settings`;
    return { content: `Tool failed: ${error}`, success: false, error };
  }

  try {
    const result = await plugin.executeTool(cleanName, args);
    if (!result.success && !result.content) {
      return {
        ...result,
        content: `Tool "${cleanName}" failed: ${result.error || "Unknown error"}`,
      };
    }
    return result;
  } catch (err: any) {
    const error = err.message || String(err);
    return { content: `Tool "${cleanName}" failed: ${error}`, success: false, error };
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

export function convertToolsForOpenAIResponses(tools: PluginTool[]): any[] {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
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
  provider?: string;
  model?: string;
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

export function convertMessagesToOpenAIResponsesInput(messages: Message[]): any[] {
  return messages.flatMap((m) => {
    if (m.role === "tool") {
      return [{ type: "function_call_output", call_id: m.toolCallId, output: m.content }];
    }

    const items: any[] = [];

    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      if (m.content && m.content !== "Using tools...") {
        items.push({
          role: "assistant",
          content: [{ type: "output_text", text: m.content }],
        });
      }
      items.push(
        ...m.toolCalls.map((tc) => ({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        }))
      );
      return items;
    }

    return [{
      role: m.role,
      content: m.images?.length
        ? [
            { type: m.role === "assistant" ? "output_text" : "input_text", text: m.content },
            ...m.images.map((img) => ({
              type: "input_image" as const,
              image_url: img.dataUrl,
            })),
          ]
        : [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }],
    }];
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
        role: "function",
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
        parts: m.toolCalls.map((tc) => {
          const part: any = {
            functionCall: { name: tc.name, args: tc.arguments },
          };
          const sig = tc.thought_signature || tc.thoughtSignature;
          if (sig) {
            part.thought_signature = sig;
          }
          return part;
        }),
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
