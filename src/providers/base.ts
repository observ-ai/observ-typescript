export interface GatewayMessage {
  role: string;
  content: string;
}

export interface CompletionRequest {
  request_id?: string;
  provider: string;
  model: string;
  messages: GatewayMessage[];
  features: {
    trace: boolean;
    recall: boolean;
    resilience: boolean;
    adapt: boolean;
  };
  external_session_id?: string;
  environment?: string;
  metadata?: Record<string, any>;
}

export interface GatewayResponse {
  action: "cache_hit" | "proceed";
  request_id: string;
  trace_id: string;
  content?: string;
  model?: string;
  external_session_id?: string;
  metadata?: Record<string, any>;
}

export interface CompletionCallback {
  trace_id: string;
  content: string;
  duration_ms: number;
  tokens_used: number;
  error?: string;
}

export function convertMessagesToGatewayFormat(
  messages: Array<{ role?: string; content?: string; text?: string }>
): GatewayMessage[] {
  const gatewayMessages: GatewayMessage[] = [];

  for (const msg of messages) {
    if (typeof msg === "object" && msg !== null) {
      if ("role" in msg && "content" in msg) {
        gatewayMessages.push({
          role: String(msg.role || "user"),
          content: String(msg.content || ""),
        });
      } else if ("text" in msg) {
        gatewayMessages.push({
          role: "user",
          content: String(msg.text || ""),
        });
      }
    }
  }

  return gatewayMessages;
}

export function buildCompletionRequest(
  provider: string,
  model: string,
  gatewayMessages: GatewayMessage[],
  recall: boolean,
  environment: string,
  metadata?: Record<string, any>,
  sessionId?: string
): CompletionRequest {
  return {
    provider,
    model,
    messages: gatewayMessages,
    features: {
      trace: true,
      recall,
      resilience: false,
      adapt: false,
    },
    environment,
    metadata,
    external_session_id: sessionId,
  };
}
