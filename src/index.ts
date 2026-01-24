import type { ObservInstance } from "./observ-instance";
import {
  AnthropicMessagesWrapper,
  MistralChatCompletionsWrapper,
  OpenAIChatCompletionsWrapper,
  VercelAIMiddleware,
} from "./providers";
import type { CompletionCallback } from "./providers/base";
import type {
  AnthropicClient,
  AnthropicMessage,
  MistralClient,
  MistralCompletion,
  OpenAIClient,
  OpenAICompletion,
} from "./types";

export interface ObservOptions {
  apiKey: string;
  projectId?: string;
  recall?: boolean;
  environment?: string;
  endpoint?: string;
  /** Enable debug logging. Default: false */
  debug?: boolean;
}

export class Observ implements ObservInstance {
  public readonly apiKey: string;
  public readonly projectId: string;
  public readonly recall: boolean;
  public readonly endpoint: string;
  public readonly environment: string;
  public readonly debug: boolean;
  public jwtToken?: string;

  constructor(options: ObservOptions) {
    this.apiKey = options.apiKey;
    this.projectId = options.projectId || "default";
    this.recall = options.recall || true;
    this.environment = options.environment || "production";
    this.endpoint = options.endpoint || "https://api.observ.dev";
    this.debug = options.debug || false;
  }

  /** Log a message if debug mode is enabled */
  log(message: string): void {
    if (this.debug) {
      console.log(`[Observ] ${message}`);
    }
  }
  /** Set JWT token for session reuse */
  setJWTToken(token: string): void {
    this.jwtToken = token;
  }

  /** Get authorization header (JWT if available, otherwise API key) */
  getAuthHeader(): string {
    if (this.jwtToken) {
      return `Bearer ${this.jwtToken}`;
    }
    return `Bearer ${this.apiKey}`;
  }

  anthropic<T extends { messages: any }>(client: T): T & AnthropicClient {
    // Store the original create method BEFORE wrapping to avoid infinite recursion
    const originalCreate = client.messages.create.bind(client.messages);
    const wrapper = new AnthropicMessagesWrapper(originalCreate, this);
    (client.messages as any).create = wrapper.create.bind(wrapper);
    (client.messages as any).withMetadata = wrapper.withMetadata.bind(wrapper);
    (client.messages as any).withSessionId =
      wrapper.withSessionId.bind(wrapper);
    return client as T & AnthropicClient;
  }

  openai<T extends { chat: { completions: any } }>(
    client: T
  ): T & OpenAIClient {
    // Store the original create method BEFORE wrapping to avoid infinite recursion
    const originalCreate = client.chat.completions.create.bind(
      client.chat.completions
    );
    const wrapper = new OpenAIChatCompletionsWrapper(originalCreate, this);
    (client.chat.completions as any).create = wrapper.create.bind(wrapper);
    (client.chat.completions as any).withMetadata =
      wrapper.withMetadata.bind(wrapper);
    (client.chat.completions as any).withSessionId =
      wrapper.withSessionId.bind(wrapper);
    return client as T & OpenAIClient;
  }

  xai<T extends { chat: { completions: any } }>(client: T): T & OpenAIClient {
    return this.openai(client);
  }

  openrouter<T extends { chat: { completions: any } }>(
    client: T
  ): T & OpenAIClient {
    return this.openai(client);
  }

  mistral<T extends { chat: { completions: any } }>(
    client: T
  ): T & MistralClient {
    // Store the original create method BEFORE wrapping to avoid infinite recursion
    const originalCreate = client.chat.completions.create.bind(
      client.chat.completions
    );
    const wrapper = new MistralChatCompletionsWrapper(originalCreate, this);
    (client.chat.completions as any).create = wrapper.create.bind(wrapper);
    (client.chat.completions as any).withMetadata =
      wrapper.withMetadata.bind(wrapper);
    (client.chat.completions as any).withSessionId =
      wrapper.withSessionId.bind(wrapper);
    return client as T & MistralClient;
  }

  /**
   * Wrap a Vercel AI SDK language model with Observ middleware
   * Provides transparent caching and observability for any Vercel AI SDK model
   *
   * @example
   * ```ts
   * import { openai } from '@ai-sdk/openai';
   * import { generateText } from 'ai';
   *
   * const observ = new Observ({ apiKey: '...', recall: true });
   * const model = observ.wrap(openai('gpt-4'));
   *
   * const result = await generateText({
   *   model,
   *   prompt: 'Hello!'
   * });
   * ```
   */
  wrap<T>(model: T): T {
    // Import wrapLanguageModel dynamically to avoid bundling Vercel AI SDK
    // if users don't use this feature
    try {
      // Try to import from 'ai' package
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { wrapLanguageModel } = require("ai");

      const middleware = new VercelAIMiddleware(this);

      return wrapLanguageModel({
        model,
        middleware: {
          transformParams: middleware.transformParams,
          wrapGenerate: middleware.wrapGenerate,
          wrapStream: middleware.wrapStream,
        },
      }) as T;
    } catch (error: any) {
      this.log(`Failed to wrap Vercel AI SDK model: ${error.message}`);
      this.log("Make sure you have 'ai' package installed: npm install ai");
      throw new Error(
        "Vercel AI SDK ('ai' package) is required to use wrap() method"
      );
    }
  }

  async sendCallbackAnthropic(
    traceId: string,
    response: AnthropicMessage,
    durationMs: number
  ): Promise<void> {
    try {
      const content =
        response.content && response.content.length > 0
          ? response.content[0]?.text || ""
          : "";

      // Extract tokens - Anthropic provides input_tokens and output_tokens separately
      let tokensUsed = 0;
      if (response.usage) {
        if (
          typeof response.usage.input_tokens === "number" &&
          typeof response.usage.output_tokens === "number"
        ) {
          tokensUsed =
            response.usage.input_tokens + response.usage.output_tokens;
        }
      }

      // Extract tool calls from Anthropic response
      const toolCalls: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: any };
      }> = [];
      
      if (response.content && response.content.length > 0) {
        for (const item of response.content) {
          if (item.type === "tool_use" && item.id && item.name) {
            toolCalls.push({
              id: item.id,
              type: "function",
              function: {
                name: item.name,
                arguments: item.input || {},
              },
            });
          }
        }
      }

      const callback: CompletionCallback = {
        trace_id: traceId,
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        duration_ms: durationMs,
        tokens_used: tokensUsed,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for callbacks

      await fetch(`${this.endpoint}/v1/llm/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callback),
        signal: controller.signal,
      })
        .catch((err: unknown) => {
          // Silently ignore callback errors - they're fire-and-forget
        })
        .finally(() => {
          clearTimeout(timeoutId);
        });
    } catch (error) {
      // Silently ignore callback errors
    }
  }

  async sendCallbackOpenAI(
    traceId: string,
    response: OpenAICompletion,
    durationMs: number
  ): Promise<void> {
    try {
      const content =
        response.choices && response.choices.length > 0
          ? response.choices[0].message.content || ""
          : "";

      const tokensUsed = response.usage?.total_tokens || 0;

      // Extract tool calls from OpenAI response
      const toolCalls: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: any };
      }> = [];
      
      if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        if (choice.message.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            // Parse arguments string to object
            let args: any = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = { raw: tc.function.arguments };
            }
            
            toolCalls.push({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: args,
              },
            });
          }
        }
      }

      const callback: CompletionCallback = {
        trace_id: traceId,
        content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        duration_ms: durationMs,
        tokens_used: tokensUsed,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for callbacks

      await fetch(`${this.endpoint}/v1/llm/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callback),
        signal: controller.signal,
      })
        .catch((err: unknown) => {
          // Ignore callback errors - they're fire-and-forget
        })
        .finally(() => {
          clearTimeout(timeoutId);
        });
    } catch (error) {
      console.error(`Observ callback error: ${error}`);
    }
  }

  async sendCallbackMistral(
    traceId: string,
    response: MistralCompletion,
    durationMs: number
  ): Promise<void> {
    try {
      const content =
        response.choices && response.choices.length > 0
          ? response.choices[0].message.content || ""
          : "";

      const tokensUsed = response.usage?.total_tokens || 0;

      const callback: CompletionCallback = {
        trace_id: traceId,
        content,
        duration_ms: durationMs,
        tokens_used: tokensUsed,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for callbacks

      await fetch(`${this.endpoint}/v1/llm/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callback),
        signal: controller.signal,
      })
        .catch((err: unknown) => {
          // Ignore callback errors - they're fire-and-forget
        })
        .finally(() => {
          clearTimeout(timeoutId);
        });
    } catch (error) {
      console.error(`Observ callback error: ${error}`);
    }
  }
}

export default Observ;
