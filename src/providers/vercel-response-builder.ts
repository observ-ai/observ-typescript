/**
 * Builds Vercel AI SDK response formats from cached content
 */
export class VercelResponseBuilder {
  /**
   * Build a DoGenerateResult from cached content
   * Used for generateText and generateObject cache hits
   */
  static buildGenerateResult(cachedContent: string, modelId: string): any {
    return {
      content: cachedContent, // Vercel AI SDK v5+ uses content, not text
      toolCalls: [],
      toolResults: [],
      finishReason: "stop",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      warnings: [],
      request: {
        body: null,
      },
      response: {
        id: "cached",
        modelId: modelId,
        timestamp: new Date(),
      },
      rawResponse: {
        headers: {},
      },
      logprobs: undefined,
    };
  }

  /**
   * Simulate a ReadableStream from cached content
   * Used for streamText and streamObject cache hits
   *
   * Note: This creates a simple stream simulation. For production use,
   * we'll need to import and use Vercel AI SDK's simulateReadableStream utility.
   */
  static simulateStream(cachedContent: string, _modelId: string): any {
    // For now, we'll create a basic stream
    // In production, this should use: import { simulateReadableStream } from 'ai'

    const stream = new ReadableStream({
      start(controller) {
        // Send the complete cached content as a single chunk
        controller.enqueue({
          type: "text-delta" as const,
          textDelta: cachedContent,
        });

        // Send finish event
        controller.enqueue({
          type: "finish" as const,
          finishReason: "stop" as const,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          logprobs: undefined,
        });

        controller.close();
      },
    });

    return {
      stream,
      warnings: [],
      rawResponse: {
        headers: {},
      },
    };
  }
}
