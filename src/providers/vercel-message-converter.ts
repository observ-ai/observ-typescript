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

    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Multi-part content (text + images)
      content = msg.content
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("\n");
    } else if (msg.content && typeof msg.content === "object") {
      // Object content
      content = JSON.stringify(msg.content);
    }

    // Build base message
    const gatewayMsg: GatewayMessage = { role, content };

    // Handle tool calls (for assistant messages with tool invocations)
    if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
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

    // Handle tool result messages (Vercel AI SDK format)
    if (msg.toolCallId) {
      gatewayMsg.tool_call_id = msg.toolCallId;
    }

    // Handle tool name (for tool result messages)
    if (msg.toolName) {
      gatewayMsg.name = msg.toolName;
    }

    return gatewayMsg;
  }
}
