/**
 * Interface for Observ instance used by providers
 * This breaks the circular dependency between index.ts and providers
 */
export interface ObservInstance {
  apiKey: string;
  recall: boolean;
  environment: string;
  endpoint: string;
  debug: boolean;
  log(message: string): void;
  sendCallbackAnthropic(
    traceId: string,
    response: any,
    durationMs: number
  ): Promise<void>;
  sendCallbackOpenAI(
    traceId: string,
    response: any,
    durationMs: number
  ): Promise<void>;
  sendCallbackMistral(
    traceId: string,
    response: any,
    durationMs: number
  ): Promise<void>;
}
