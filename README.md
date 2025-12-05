# Observ SDK

AI tracing and semantic caching SDK for [Observ](https://useobserv.com).

## Installation

```bash
npm install observ-sdk
```

Install provider-specific SDKs as needed:

```bash
# For Anthropic
npm install @anthropic-ai/sdk

# For OpenAI
npm install openai

# For Mistral
npm install @mistralai/mistralai

# For Vercel AI SDK (recommended for multi-provider support)
npm install ai
```

## Quick Start

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
import Observ from "observ-sdk";

const ob = new Observ({
  apiKey: "your-observ-api-key",
  recall: true, // Enable semantic caching
});

const client = new Anthropic({ apiKey: "your-anthropic-key" });
const wrappedClient = ob.anthropic(client);

// Use normally - all calls are automatically traced
const response = await wrappedClient.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### OpenAI

```typescript
import OpenAI from "openai";
import Observ from "observ-sdk";

const ob = new Observ({
  apiKey: "your-observ-api-key",
  recall: true,
});

const client = new OpenAI({ apiKey: "your-openai-key" });
const wrappedClient = ob.openai(client);

const response = await wrappedClient.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Mistral

```typescript
import { Mistral } from "@mistralai/mistralai";
import Observ from "observ-sdk";

const ob = new Observ({
  apiKey: "your-observ-api-key",
  recall: true,
});

const client = new Mistral({ apiKey: "your-mistral-key" });
const wrappedClient = ob.mistral(client);

const response = await wrappedClient.chat.completions.create({
  model: "mistral-large-latest",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Vercel AI SDK (Recommended)

The Vercel AI SDK integration provides the most flexible way to use Observ with 25+ AI providers through a unified API.

```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
```

```typescript
import { Observ } from "observ-sdk";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, streamText } from "ai";

const observ = new Observ({
  apiKey: "your-observ-api-key",
  recall: true, // Enable semantic caching
});

// Wrap any Vercel AI SDK model
const model = observ.wrap(openai("gpt-4"));

// Use with generateText
const result = await generateText({
  model,
  prompt: "What is TypeScript?",
});

// Streaming works automatically
const stream = await streamText({
  model,
  prompt: "Write a haiku about coding",
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

// Add metadata for better observability
const result2 = await generateText({
  model,
  prompt: "Explain async/await",
  providerOptions: {
    observ: {
      metadata: { user_id: "123", topic: "javascript" },
      sessionId: "session-abc",
    },
  },
});
```

**Benefits of Vercel AI SDK integration:**

- ✅ Works with 25+ providers (OpenAI, Anthropic, Google, Mistral, Cohere, etc.)
- ✅ Supports streaming, structured outputs, and tool calling
- ✅ Semantic caching works across all providers
- ✅ Unified API - switch providers without code changes
- ✅ Built-in type safety

## Configuration

```typescript
const ob = new Observ({
  apiKey: "your-observ-api-key", // Required
  recall: true, // Enable semantic caching (default: false)
  environment: "production", // Environment tag (default: "production")
  endpoint: "https://api.example.com", // Custom endpoint (optional)
  debug: false, // Enable debug logging (default: false)
});
```

## Features

- **Automatic Tracing**: All LLM calls are automatically traced
- **Semantic Caching**: Cache similar prompts to reduce costs and latency
- **Multi-Provider**: Support for Anthropic, OpenAI, Mistral, xAI, OpenRouter, and 25+ providers via Vercel AI SDK
- **Vercel AI SDK Integration**: Unified API for all major LLM providers with full streaming and tool calling support
- **Session Tracking**: Group related calls with session IDs
- **Metadata**: Attach custom metadata to traces

## Metadata & Sessions

```typescript
// Add metadata to a request
const response = await wrappedClient.messages
  .withMetadata({ user_id: "123", feature: "chat" })
  .create({
    model: "claude-sonnet-4-20250514",
    messages: [{ role: "user", content: "Hello!" }],
  });

// Track conversation sessions
const response = await wrappedClient.messages
  .withSessionId("conversation-abc")
  .create({
    model: "claude-sonnet-4-20250514",
    messages: [{ role: "user", content: "Hello!" }],
  });
```

## License

MIT
