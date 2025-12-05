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

    return { role, content };
  }
}
