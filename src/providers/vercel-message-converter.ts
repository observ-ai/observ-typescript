import type { GatewayMessage } from "./base";

/**
 * Converts Vercel AI SDK prompt formats to Observ gateway format
 */
export class VercelMessageConverter {
  /**
   * Convert Vercel AI SDK prompt to gateway messages
   * Handles both simple string prompts and CoreMessage arrays
   */
  static toGatewayFormat(prompt: any): GatewayMessage[] {
    // Handle simple string prompt
    if (typeof prompt === "string") {
      return [
        {
          role: "user",
          content: prompt,
        },
      ];
    }

    // Handle CoreMessage array format
    if (Array.isArray(prompt)) {
      return prompt.map((msg) => this.convertMessage(msg));
    }

    // Handle object with messages property
    if (prompt && typeof prompt === "object" && prompt.messages) {
      return prompt.messages.map((msg: any) => this.convertMessage(msg));
    }

    // Fallback - try to convert to string
    return [
      {
        role: "user",
        content: String(prompt),
      },
    ];
  }

  /**
   * Convert a single message to gateway format
   */
  private static convertMessage(msg: any): GatewayMessage {
    const role = msg.role || "user";

    // Handle different content formats
    let content = "";
    let toolCallId = "";
    let toolName = "";
    const extractedToolCalls: any[] = [];

    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Multi-part content - could be text, tool calls, tool results, etc.
      const textParts: string[] = [];
      
      for (const part of msg.content) {
        if (part.type === "text" && part.text) {
          textParts.push(part.text);
        }
        // Handle tool call parts (Vercel AI SDK format for assistant messages)
        if (part.type === "tool-call" || part.type === "tool_call") {
          extractedToolCalls.push({
            id: part.toolCallId || part.id,
            type: "function",
            function: {
              name: part.toolName || part.name,
              arguments: typeof part.args === "string" 
                ? part.args 
                : JSON.stringify(part.args || {}),
            },
          });
        }
        // Handle tool result parts (Vercel AI SDK format)
        if (part.type === "tool-result" || part.type === "tool_result") {
          toolCallId = part.toolCallId || part.tool_use_id || "";
          toolName = part.toolName || "";
          // Extract result content
          if (part.result !== undefined) {
            content = typeof part.result === "string" 
              ? part.result 
              : JSON.stringify(part.result);
          } else if (part.content !== undefined) {
            content = typeof part.content === "string"
              ? part.content
              : JSON.stringify(part.content);
          }
        }
      }
      
      // If we found text parts and no tool result content, use text
      if (textParts.length > 0 && !content) {
        content = textParts.join("\n");
      }
    } else if (msg.content && typeof msg.content === "object") {
      // Object content
      content = JSON.stringify(msg.content);
    }

    // Build base message
    const gatewayMsg: GatewayMessage = { role, content };

    // Handle tool calls from content array (Vercel AI SDK format)
    if (extractedToolCalls.length > 0) {
      gatewayMsg.tool_calls = extractedToolCalls;
    }
    // Also check for tool calls at message root level
    else if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
      gatewayMsg.tool_calls = msg.toolCalls.map((tc: any) => ({
        id: tc.toolCallId || tc.id,
        type: tc.type || "function",
        function: {
          name: tc.toolName || tc.function?.name,
          arguments: typeof tc.args === "string" 
            ? tc.args 
            : JSON.stringify(tc.args || tc.function?.arguments || {}),
        },
      }));
    }

    // Handle tool result messages - check multiple possible field names
    // Priority: extracted from content > direct field > Vercel AI SDK format
    if (toolCallId) {
      gatewayMsg.tool_call_id = toolCallId;
    } else if (msg.toolCallId) {
      gatewayMsg.tool_call_id = msg.toolCallId;
    } else if (msg.tool_call_id) {
      gatewayMsg.tool_call_id = msg.tool_call_id;
    }

    // Handle tool name (for tool result messages)
    if (toolName) {
      gatewayMsg.name = toolName;
    } else if (msg.toolName) {
      gatewayMsg.name = msg.toolName;
    } else if (msg.name) {
      gatewayMsg.name = msg.name;
    }

    // For tool role messages, also extract result from msg.result if present
    if (role === "tool" && !content) {
      if (msg.result !== undefined) {
        content = typeof msg.result === "string"
          ? msg.result
          : JSON.stringify(msg.result);
        gatewayMsg.content = content;
      }
    }

    return gatewayMsg;
  }
}
