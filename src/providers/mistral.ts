import type { ObservInstance } from "../observ-instance";
import type {
  MistralCompletion,
  MistralCompletionCreateParams,
} from "../types";
import {
  buildCompletionRequest,
  convertMessagesToGatewayFormat,
  type GatewayResponse,
} from "./base";

export class MistralChatCompletionsWrapper {
  private _originalCreate: (
    params: MistralCompletionCreateParams
  ) => Promise<MistralCompletion>;
  private _wt: ObservInstance;
  private _metadata: Record<string, any> = {};
  private _sessionId?: string;

  constructor(
    originalCreate: (
      params: MistralCompletionCreateParams
    ) => Promise<MistralCompletion>,
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
    params: MistralCompletionCreateParams
  ): Promise<MistralCompletion> {
    const metadata = this._metadata;
    const sessionId = this._sessionId;
    this._metadata = {};
    this._sessionId = undefined;
    const messages = params.messages || [];
    const model = params.model || "mistral-large-latest";

    const gatewayMessages = convertMessagesToGatewayFormat(messages);

    const completionRequest = buildCompletionRequest(
      "mistral",
      model,
      gatewayMessages,
      this._wt.recall,
      this._wt.environment,
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

      const gatewayResponse: GatewayResponse = await response.json();

      if (gatewayResponse.action === "cache_hit") {
        const cachedContent = gatewayResponse.content || "";
        return {
          id: "",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: cachedContent,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        } as MistralCompletion;
      }

      const traceId = gatewayResponse.trace_id;
      const startTime = Date.now();

      const actualResponse = await this._originalCreate(params);

      const durationMs = Date.now() - startTime;

      // Fire-and-forget callback (don't await)
      this._wt
        .sendCallbackMistral(traceId, actualResponse, durationMs)
        .catch(() => {
          // Silently ignore callback errors
        });

      return actualResponse;
    } catch (error: any) {
      this._wt.log(`Gateway error: ${error.message || error}`);
      this._wt.log("Falling back to direct Mistral API call...");
      return await this._originalCreate(params);
    }
  }
}
