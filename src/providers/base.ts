export interface GatewayMessage {
  role: string;
  content: string;
  // Tool calling support (OpenAI/Anthropic format)
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
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
  messages: Array<{ 
    role?: string; 
    content?: string; 
    text?: string;
    tool_calls?: any;
    tool_call_id?: string;
    name?: string;
  }>
): GatewayMessage[] {
  const gatewayMessages: GatewayMessage[] = [];

  for (const msg of messages) {
    if (typeof msg === "object" && msg !== null) {
      if ("role" in msg && "content" in msg) {
        const gatewayMsg: GatewayMessage = {
          role: String(msg.role || "user"),
          content: String(msg.content || ""),
        };
        
        // Include tool calling fields if present
        if (msg.tool_calls) {
          gatewayMsg.tool_calls = msg.tool_calls;
        }
        if (msg.tool_call_id) {
          gatewayMsg.tool_call_id = msg.tool_call_id;
        }
        if (msg.name) {
          gatewayMsg.name = msg.name;
        }
        
        gatewayMessages.push(gatewayMsg);
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
