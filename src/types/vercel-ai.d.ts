/**
 * Type definitions for Vercel AI SDK integration
 */

/**
 * Options passed to Vercel AI SDK functions via providerOptions.observ
 *
 * @example
 * ```ts
 * await generateText({
 *   model: wrappedModel,
 *   prompt: 'Hello',
 *   providerOptions: {
 *     observ: {
 *       metadata: { user_id: '123' },
 *       sessionId: 'session-abc'
 *     }
 *   }
 * });
 * ```
 */
export interface ObservOptions {
  /**
   * Custom metadata to attach to this request
   * Will be visible in the Observ dashboard
   */
  metadata?: Record<string, any>;

  /**
   * Session ID to group related requests
   * Useful for tracking conversations or user sessions
   */
  sessionId?: string;
}

/**
 * Extended provider options for Vercel AI SDK calls
 */
export interface VercelAICallSettings {
  observ?: ObservOptions;
  [key: string]: any;
}

// Extend the global type if ai package is installed
declare module "ai" {
  interface CallSettings {
    providerOptions?: {
      observ?: ObservOptions;
      [key: string]: any;
    };
  }
}
