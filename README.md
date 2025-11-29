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
- **Multi-Provider**: Support for Anthropic, OpenAI, Mistral, xAI, and OpenRouter
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
