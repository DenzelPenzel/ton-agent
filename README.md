# TON Agent

A TypeScript library for building autonomous agents on the TON blockchain.

## Overview

TON Agent is a modular framework that enables the creation of AI-powered agents capable of interacting with the TON blockchain. Built with TypeScript in a monorepo structure, it provides a flexible and extensible architecture for developing blockchain agents.

## Project Structure

This project is organized as a monorepo using pnpm workspaces:

### Packages

- `@ton-agent/core`: Core package containing wallet providers, action providers, and the base agent implementation
- `@ton-agent/langchain`: Integration with LangChain for AI capabilities

### Examples

- `examples/simple`: A demonstration application showing TON Agent usage with production-ready code practices

## Key Features

- **Wallet Management**: Secure wallet data storage and provider system
- **Action System**: Extensible action providers for blockchain interactions
- **AI Integration**: LangChain integration for intelligent agent behavior
- **TypeScript**: Full TypeScript support with proper typing
- **Error Handling**: Robust error handling with graceful recovery
- **Configuration Management**: Structured configuration system

## Getting Started

### Prerequisites

- Node.js 18 or higher
- pnpm 9.0.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/ton-agent.git
cd ton-agent

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Configuration

Copy the example environment file and update it with your settings:

```bash
cp .env.example .env
```

### Development

To develop all packages simultaneously:

```bash
pnpm dev
```

To check types across all packages:

```bash
pnpm check-types
```

## Example Usage

See the `examples/simple` directory for a complete example of how to use TON Agent.

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]
