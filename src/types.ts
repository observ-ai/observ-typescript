/**
 * Type definitions for wrapped clients
 */

// Re-export types from provider SDKs when available
// These are optional dependencies, so we use conditional types

export interface WithMetadata<T> {
  withMetadata(metadata: Record<string, any>): T;
}

export interface WithSessionId<T> {
  withSessionId(sessionId: string): T;
}

// Anthropic types
export interface AnthropicClient {
  messages: AnthropicMessages & WithMetadata<AnthropicMessages> & WithSessionId<AnthropicMessages>;
}

export interface AnthropicMessages {
  create(
    params: AnthropicMessageCreateParams
  ): Promise<AnthropicMessage>;
}

export interface AnthropicMessageCreateParams {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  [key: string]: any;
}

export interface AnthropicMessage {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// OpenAI types
export interface OpenAIClient {
  chat: {
    completions: OpenAICompletions & WithMetadata<OpenAICompletions> & WithSessionId<OpenAICompletions>;
  };
}

export interface OpenAICompletions {
  create(
    params: OpenAICompletionCreateParams
  ): Promise<OpenAICompletion>;
}

export interface OpenAICompletionCreateParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  [key: string]: any;
}

export interface OpenAICompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Mistral types
export interface MistralClient {
  chat: {
    completions: MistralCompletions & WithMetadata<MistralCompletions> & WithSessionId<MistralCompletions>;
  };
}

export interface MistralCompletions {
  create(
    params: MistralCompletionCreateParams
  ): Promise<MistralCompletion>;
}

export interface MistralCompletionCreateParams {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  [key: string]: any;
}

export interface MistralCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

