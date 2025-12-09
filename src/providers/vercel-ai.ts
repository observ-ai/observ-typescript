import type { ObservInstance } from "../observ-instance";
import {
  buildCompletionRequest,
  type GatewayResponse,
  type CompletionCallback,
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
          this._observ.log(`Fixing missing type field for tool: ${tool.name || key}`);
          tool.inputSchema.type = 'object';
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

    this._observ.log("VercelAI: wrapping generate call");

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
        this._observ.log("Cache hit! Returning cached response");
        // Convert cached content to Vercel AI SDK format
        return VercelResponseBuilder.buildGenerateResult(
          gatewayResponse.content!,
          modelId
        );
      }

      // Cache miss - proceed with actual API call
      const traceId = gatewayResponse.trace_id;
      this._observ.log(`Cache miss, trace_id: ${traceId}`);

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

    this._observ.log("VercelAI: wrapping stream call");

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
        this._observ.log("Cache hit! Simulating stream from cached content");
        // Convert cached content to simulated stream
        return VercelResponseBuilder.simulateStream(
          gatewayResponse.content!,
          modelId
        );
      }

      // Cache miss - proceed with actual streaming
      const traceId = gatewayResponse.trace_id;
      this._observ.log(`Cache miss (streaming), trace_id: ${traceId}`);

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
        const errorText = await response.text().catch(() => response.statusText);
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

    this._observ.log(`Extracted model info: ${provider}/${modelId}`);

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
   */
  private extractContentFromChunks(chunks: any[]): string {
    let content = "";
    for (const chunk of chunks) {
      if (chunk.type === "text-delta" && chunk.textDelta) {
        content += chunk.textDelta;
      }
    }
    return content;
  }

  /**
   * Extract token usage from stream chunks
   */
  private extractTokensFromChunks(chunks: any[]): number {
    for (const chunk of chunks) {
      if (chunk.type === "finish" && chunk.usage) {
        return chunk.usage.totalTokens || 0;
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
    const content = result.text || "";
    const tokensUsed = result.usage?.totalTokens || 0;

    await this.sendCallbackToGateway(traceId, content, durationMs, tokensUsed);
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
    await this.sendCallbackToGateway(traceId, content, durationMs, tokensUsed);
  }

  /**
   * Send callback to gateway (shared implementation)
   */
  private async sendCallbackToGateway(
    traceId: string,
    content: string,
    durationMs: number,
    tokensUsed: number
  ): Promise<void> {
    const callback: CompletionCallback = {
      trace_id: traceId,
      content,
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
