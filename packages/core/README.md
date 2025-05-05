# @ton-agent/core

Core utilities and types for the ton-agent project.

## Installation

This package is part of the ton-agent monorepo. To use it in another package within this monorepo:

```bash
# From another package in the monorepo
pnpm add @ton-agent/core@workspace
```

## Usage

```typescript
import { hello, type CoreConfig, type Result } from "@ton-agent/core";

// Use the hello function
console.log(hello("Agent")); // Outputs: Hello, Agent!

// Use the types
const config: CoreConfig = {
  debug: true,
  environment: "development",
};

const result: Result<string> = {
  success: true,
  data: "Mission accomplished",
};
```

## Development

```bash
# Build the package
pnpm build

# Run tests
pnpm test

# Development mode with watch
pnpm dev
```
