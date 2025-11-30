import type { ObservInstance } from "../observ-instance";
import type { AnthropicMessage, AnthropicMessageCreateParams } from "../types";
import {
  buildCompletionRequest,
  convertMessagesToGatewayFormat,
  type GatewayResponse,
} from "./base";

export class AnthropicMessagesWrapper {
  private _originalCreate: (
    params: AnthropicMessageCreateParams
  ) => Promise<AnthropicMessage>;
  private _wt: ObservInstance;
  private _metadata: Record<string, any> = {};
  private _sessionId?: string;

  constructor(
    originalCreate: (
      params: AnthropicMessageCreateParams
    ) => Promise<AnthropicMessage>,
    observInstance: ObservInstance
  ) {
    this._originalCreate = originalCreate;
    this._wt = observInstance;
  }

  withMetadata(metadata: Record<string, any>): this {
    this._metadata = metadata;
    return this;
  }

  withSessionId(sessionId: string): this {
    this._sessionId = sessionId;
    return this;
  }

  async create(
    params: AnthropicMessageCreateParams
  ): Promise<AnthropicMessage> {
    const metadata = this._metadata;
    const sessionId = this._sessionId;
    this._metadata = {};
    this._sessionId = undefined;
    const messages = params.messages || [];
    const model = params.model || "claude-3-5-sonnet-20241022";

    const gatewayMessages = convertMessagesToGatewayFormat(messages);

    const completionRequest = buildCompletionRequest(
      "anthropic",
      model,
      gatewayMessages,
      this._wt.recall,
      this._wt.environment,
      metadata,
      sessionId
    );

    this._wt.log(
      `Sending request to gateway: ${this._wt.endpoint}/v1/llm/complete`
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000); // 10 second timeout for gateway

      let response: Response;
      try {
        response = await fetch(`${this._wt.endpoint}/v1/llm/complete`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this._wt.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(completionRequest),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === "AbortError") {
          throw new Error(
            `Gateway timeout after 10s - is Observ running at ${this._wt.endpoint}?`
          );
        }
        throw new Error(
          `Gateway connection error: ${fetchError.message} - is Observ running at ${this._wt.endpoint}?`
        );
      }

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => response.statusText);
        throw new Error(`Gateway error ${response.status}: ${errorText}`);
      }

      this._wt.log(`Gateway responded with status: ${response.status}`);
      const gatewayResponse: GatewayResponse = await response.json();
      this._wt.log(`Gateway action: ${gatewayResponse.action}`);

      if (gatewayResponse.action === "cache_hit") {
        this._wt.log(`Cache hit! Returning cached content`);
        const cachedContent = gatewayResponse.content || "";
        return {
          id: "",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: cachedContent,
            },
          ],
          model,
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        } as AnthropicMessage;
      }

      const traceId = gatewayResponse.trace_id;
      this._wt.log(
        `Cache miss, proceeding with Anthropic API call (trace_id: ${traceId})`
      );
      const startTime = Date.now();

      const actualResponse = await this._originalCreate(params);
      this._wt.log(`Anthropic API call completed`);

      const durationMs = Date.now() - startTime;

      // Fire-and-forget callback (don't await)
      this._wt
        .sendCallbackAnthropic(traceId, actualResponse, durationMs)
        .catch(() => {
          // Silently ignore callback errors
        });

      return actualResponse;
    } catch (error: any) {
      this._wt.log(`Gateway error: ${error.message || error}`);
      // Fallback to direct API call on error
      this._wt.log("Falling back to direct Anthropic API call...");
      return await this._originalCreate(params);
    }
  }
}
