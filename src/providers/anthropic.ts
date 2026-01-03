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
  private _ob: ObservInstance;
  private _metadata: Record<string, any> = {};
  private _sessionId?: string;

  constructor(
    originalCreate: (
      params: AnthropicMessageCreateParams
    ) => Promise<AnthropicMessage>,
    observInstance: ObservInstance
  ) {
    this._originalCreate = originalCreate;
    this._ob = observInstance;
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
      this._ob.recall,
      this._ob.environment,
      metadata,
      sessionId
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000); // 10 second timeout for gateway

      let response: Response;
      try {
        response = await fetch(`${this._ob.endpoint}/v1/llm/complete`, {
          method: "POST",
          headers: {
            Authorization: this._ob.getAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(completionRequest),
          signal: controller.signal,
          credentials: "include",
        });
        clearTimeout(timeoutId);

        // Check for new JWT token in response headers
        const sessionToken = response.headers.get("x-session-token");
        if (sessionToken) {
          this._ob.setJWTToken(sessionToken);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === "AbortError") {
          throw new Error(
            `Gateway timeout after 10s - is Observ running at ${this._ob.endpoint}?`
          );
        }
        throw new Error(
          `Gateway connection error: ${fetchError.message} - is Observ running at ${this._ob.endpoint}?`
        );
      }

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => response.statusText);
        throw new Error(`Gateway error ${response.status}: ${errorText}`);
      }

      this._ob.log(`Gateway responded with status: ${response.status}`);
      const gatewayResponse: GatewayResponse = await response.json();
      this._ob.log(`Gateway action: ${gatewayResponse.action}`);

      if (gatewayResponse.action === "cache_hit") {
        this._ob.log(`Cache hit! Returning cached content`);
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
      this._ob.log(
        `Cache miss, proceeding with Anthropic API call (trace_id: ${traceId})`
      );
      const startTime = Date.now();

      const actualResponse = await this._originalCreate(params);
      this._ob.log(`Anthropic API call completed`);

      const durationMs = Date.now() - startTime;

      // Fire-and-forget callback (don't await)
      this._ob
        .sendCallbackAnthropic(traceId, actualResponse, durationMs)
        .catch(() => {
          // Silently ignore callback errors
        });

      return actualResponse;
    } catch (error: any) {
      this._ob.log(`Gateway error: ${error.message || error}`);
      // Fallback to direct API call on error
      this._ob.log("Falling back to direct Anthropic API call...");
      return await this._originalCreate(params);
    }
  }
}
