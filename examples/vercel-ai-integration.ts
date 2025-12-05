/**
 * Example: Using Observ SDK with Vercel AI SDK
 *
 * This example demonstrates how to integrate Observ's semantic caching
 * and observability with Vercel AI SDK.
 *
 * Features:
 * - Automatic caching of LLM responses
 * - Request tracing and observability
 * - Works with any Vercel AI SDK provider (OpenAI, Anthropic, etc.)
 * - Transparent integration (no changes to generateText calls)
 */

import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { Observ } from "observ-sdk";

async function main() {
  // 1. Initialize Observ with your API key
  const observ = new Observ({
    apiKey: process.env.OBSERV_API_KEY || "demo-key",
    recall: true, // Enable semantic caching
    environment: "development",
  });

  // 2. Wrap your Vercel AI SDK model
  const model = observ.wrap(openai("gpt-4"));

  console.log("=== Example 1: Basic generateText ===");

  // 3. Use it like any Vercel AI SDK model
  const result1 = await generateText({
    model,
    prompt: "What is the capital of France?",
  });

  console.log("Response:", result1.text);
  console.log("Usage:", result1.usage);

  console.log("\n=== Example 2: With metadata ===");

  // 4. Add metadata for better observability
  const result2 = await generateText({
    model,
    prompt: "What is the capital of France?",
    providerOptions: {
      observ: {
        metadata: {
          user_id: "user-123",
          request_type: "geography-question",
        },
        sessionId: "session-abc",
      },
    },
  });

  console.log("Response:", result2.text);
  console.log("(This should be a cache hit if gateway is running)");

  console.log("\n=== Example 3: Streaming ===");

  // 5. Streaming also works
  const stream = await streamText({
    model,
    prompt: "Write a haiku about TypeScript",
  });

  console.log("Streaming response:");
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  console.log("\n=== Integration Complete! ===");
  console.log("✅ Observ SDK is now integrated with Vercel AI SDK");
  console.log("✅ All requests are cached and traced");
  console.log("✅ Works with any Vercel AI SDK provider");
}

// Run the example
main().catch(console.error);
