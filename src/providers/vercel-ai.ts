import type { ObservInstance } from "../observ-instance";
import {
  buildCompletionRequest,
  type CompletionCallback,
  type GatewayResponse,
} from "./base";
import { VercelMessageConverter } from "./vercel-message-converter";
import { VercelResponseBuilder } from "./vercel-response-builder";

/**
 * Middleware for Vercel AI SDK integration
 * Implements LanguageModelV2Middleware interface
 */
export class VercelAIMiddleware {
  private _observ: ObservInstance;

  constructor(observInstance: ObservInstance) {
    this._observ = observInstance;
  }

  /**
   * Transform params to extract Observ-specific metadata
   * This runs before both generate and stream operations
   */
  transformParams = async (options: { type: string; params: any }) => {
    // Fix tool input schemas if present
    // Workaround for @ai-sdk/anthropic sometimes missing the "type" field in input_schema
    // Anthropic API requires input_schema to have "type": "object"
    if (options.params.tools) {
      const toolNames = Object.keys(options.params.tools);
      for (const key of toolNames) {
        const tool = options.params.tools[key];
        if (tool && tool.inputSchema && !tool.inputSchema.type) {
          tool.inputSchema.type = "object";
        }
      }
    }

    // Extract observ metadata from providerOptions if present
    const observConfig = options.params.providerOptions?.observ as
      | {
          metadata?: Record<string, any>;
          sessionId?: string;
        }
      | undefined;

    // Store in params for later use (attach to params object itself)
    if (observConfig) {
      (options.params as any)._observMetadata = observConfig.metadata;
      (options.params as any)._observSessionId = observConfig.sessionId;
    }

    return options.params;
  };

  /**
   * Wrap non-streaming generation (generateText, generateObject)
   */
  wrapGenerate = async ({ doGenerate, params, model }: any) => {
    const metadata = (params as any)._observMetadata;
    const sessionId = (params as any)._observSessionId;

    // Extract model info
    const { provider, modelId } = this.extractModelInfo(model, params);

    // Convert messages to gateway format
    const gatewayMessages = VercelMessageConverter.toGatewayFormat(
      params.prompt
    );

    // Build gateway request
    const completionRequest = buildCompletionRequest(
      provider,
      modelId,
      gatewayMessages,
      this._observ.recall,
      this._observ.environment,
      metadata,
      sessionId
    );

    try {
      // Call gateway for cache check
      const gatewayResponse = await this.callGateway(completionRequest);

      if (gatewayResponse.action === "cache_hit") {
        // Convert cached content to Vercel AI SDK format
        return VercelResponseBuilder.buildGenerateResult(
          gatewayResponse.content!,
          modelId
        );
      }

      // Cache miss - proceed with actual API call
      const traceId = gatewayResponse.trace_id;

      const startTime = Date.now();
      const result = await doGenerate();
      const durationMs = Date.now() - startTime;

      // Fire-and-forget callback
      this.sendCallback(traceId, result, durationMs).catch(() => {});

      return result;
    } catch (error: any) {
      this._observ.log(`Gateway error: ${error.message || error}`);
      // Fallback to direct API call
      return await doGenerate();
    }
  };

  /**
   * Wrap streaming generation (streamText, streamObject)
   */
  wrapStream = async ({ doStream, params, model }: any) => {
    const metadata = (params as any)._observMetadata;
    const sessionId = (params as any)._observSessionId;

    // Extract model info
    const { provider, modelId } = this.extractModelInfo(model, params);

    // Convert messages to gateway format
    const gatewayMessages = VercelMessageConverter.toGatewayFormat(
      params.prompt
    );

    // Build gateway request
    const completionRequest = buildCompletionRequest(
      provider,
      modelId,
      gatewayMessages,
      this._observ.recall,
      this._observ.environment,
      metadata,
      sessionId
    );
    try {
      // Call gateway for cache check
      const gatewayResponse = await this.callGateway(completionRequest);

      if (gatewayResponse.action === "cache_hit") {
        // Convert cached content to simulated stream
        return VercelResponseBuilder.simulateStream(
          gatewayResponse.content!,
          modelId
        );
      }

      // Cache miss - proceed with actual streaming
      const traceId = gatewayResponse.trace_id;

      const startTime = Date.now();
      const result = await doStream();

      // For streaming, we'll capture the content as it streams
      // and send the callback when complete
      // This is a simplified version - full implementation would use TransformStream
      const originalStream = result.stream;

      // Create a capturing transform stream
      const { transformedStream } = this.createCaptureStream(
        originalStream,
        traceId,
        startTime
      );

      return {
        ...result,
        stream: transformedStream,
      };
    } catch (error: any) {
      this._observ.log(`Gateway error: ${error.message || error}`);
      // Fallback to direct streaming
      return await doStream();
    }
  };

  /**
   * Call Observ gateway for cache check
   */
  private async callGateway(request: any): Promise<GatewayResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this._observ.endpoint}/v1/llm/complete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._observ.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => response.statusText);
        throw new Error(`Gateway error ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Gateway timeout after 10s`);
      }
      throw error;
    }
  }

  /**
   * Extract provider and model ID from Vercel AI SDK model object
   */
  private extractModelInfo(
    model: any,
    params: any
  ): { provider: string; modelId: string } {
    // Vercel AI SDK models have providerId and modelId properties
    const provider = model.provider || model.providerId || "unknown";
    const modelId = model.modelId || params.model || "unknown";

    return { provider, modelId };
  }

  /**
   * Create transform stream to capture chunks for callback
   */
  private createCaptureStream(
    stream: ReadableStream,
    traceId: string,
    startTime: number
  ) {
    const chunks: any[] = [];

    const transformStream = new TransformStream({
      transform: (chunk, controller) => {
        chunks.push(chunk);
        controller.enqueue(chunk);
      },
      flush: () => {
        const durationMs = Date.now() - startTime;
        const content = this.extractContentFromChunks(chunks);
        const tokensUsed = this.extractTokensFromChunks(chunks);

        // Send callback
        this.sendStreamCallback(traceId, content, durationMs, tokensUsed).catch(
          () => {}
        );
      },
    });

    return {
      transformedStream: stream.pipeThrough(transformStream),
      capturePromise: Promise.resolve(), // For future use
    };
  }

  /**
   * Extract text content from stream chunks
   * Vercel AI SDK uses 'delta' property (not 'textDelta') for text-delta chunks
   */
  private extractContentFromChunks(chunks: any[]): string {
    let content = "";
    for (const chunk of chunks) {
      if (chunk.type === "text-delta" && chunk.delta) {
        content += chunk.delta;
      }
    }
    return content;
  }

  /**
   * Extract token usage from stream chunks
   * Vercel AI SDK uses inputTokens/outputTokens (not promptTokens/completionTokens)
   * The 'finish' chunk has totalUsage, while 'finish-step' has usage
   */
  private extractTokensFromChunks(chunks: any[]): number {
    for (const chunk of chunks) {
      // Check 'finish' chunk which has totalUsage (aggregated across all steps)
      if (chunk.type === "finish" && chunk.totalUsage) {
        const { inputTokens = 0, outputTokens = 0 } = chunk.totalUsage;
        return inputTokens + outputTokens;
      }
      // Fallback to 'finish-step' chunk which has usage (per-step)
      if (chunk.type === "finish-step" && chunk.usage) {
        const { inputTokens = 0, outputTokens = 0 } = chunk.usage;
        return inputTokens + outputTokens;
      }
    }
    return 0;
  }

  /**
   * Send callback for non-streaming result
   */
  private async sendCallback(
    traceId: string,
    result: any,
    durationMs: number
  ): Promise<void> {
    // Vercel AI SDK returns content in different formats:
    // - result.text: primary text output (most common)
    // - result.content: array of content parts in v5+ [{ type: "text", text: "..." }]
    let content = "";

    // Try result.text first (most common for text generation)
    if (result.text) {
      content = result.text;
    } else if (typeof result.content === "string") {
      content = result.content;
    } else if (Array.isArray(result.content)) {
      // Extract text from content parts array (v5+ format)
      content = result.content
        .filter((part: any) => part.type === "text" && part.text)
        .map((part: any) => part.text)
        .join("");
    }

    // Vercel AI SDK uses inputTokens/outputTokens (not promptTokens/completionTokens)
    const inputTokens = result.usage?.inputTokens || 0;
    const outputTokens = result.usage?.outputTokens || 0;
    const tokensUsed = inputTokens + outputTokens;

    // Extract tool calls from Vercel AI SDK response
    // Vercel AI SDK returns tool calls in result.toolCalls or result.response?.messages
    const toolCalls: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: any };
    }> = [];
    
    // Check if result has toolCalls directly (from steps)
    if (result.toolCalls && Array.isArray(result.toolCalls)) {
      for (const tc of result.toolCalls) {
        if (tc.toolCallId && tc.toolName) {
          toolCalls.push({
            id: tc.toolCallId,
            type: "function",
            function: {
              name: tc.toolName,
              arguments: tc.args || {},
            },
          });
        }
      }
    }
    
    // Also check in response.messages for tool-call messages
    if (result.response?.messages && Array.isArray(result.response.messages)) {
      for (const msg of result.response.messages) {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === "tool-call" && part.toolCallId && part.toolName) {
              // Avoid duplicates
              if (!toolCalls.find((tc) => tc.id === part.toolCallId)) {
                toolCalls.push({
                  id: part.toolCallId,
                  type: "function",
                  function: {
                    name: part.toolName,
                    arguments: part.args || {},
                  },
                });
              }
            }
          }
        }
      }
    }

    await this.sendCallbackToGateway(
      traceId,
      content,
      durationMs,
      tokensUsed,
      toolCalls.length > 0 ? toolCalls : undefined
    );
  }

  /**
   * Send callback for streaming result
   */
  private async sendStreamCallback(
    traceId: string,
    content: string,
    durationMs: number,
    tokensUsed: number
  ): Promise<void> {
    // For streaming, tool calls would be in chunks - we'll handle this in a future update
    await this.sendCallbackToGateway(traceId, content, durationMs, tokensUsed, undefined);
  }

  /**
   * Send callback to gateway (shared implementation)
   */
  private async sendCallbackToGateway(
    traceId: string,
    content: string,
    durationMs: number,
    tokensUsed: number,
    toolCalls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: any };
    }>
  ): Promise<void> {
    const callback: CompletionCallback = {
      trace_id: traceId,
      content,
      tool_calls: toolCalls,
      duration_ms: durationMs,
      tokens_used: tokensUsed,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(`${this._observ.endpoint}/v1/llm/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callback),
        signal: controller.signal,
      }).catch(() => {});
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
