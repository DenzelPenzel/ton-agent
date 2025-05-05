import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { mnemonicNew } from "@ton/crypto";
import { TonAgent, walletActionProvider, WalletProvider, TonWalletProvider } from "@ton-agent/core";
import { getLangChainTools } from "@ton-agent/langchain";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import fs from "fs";
import path from "path";
import { createInterface } from "readline/promises";

dotenv.config();

/**
 * Interface for wallet data storage
 */
interface WalletData {
  privateKey: string;
  walletAddress: string;
  network: string;
  timestamp: number;
}

/**
 * Available agent operation modes
 */
enum AgentMode {
  CHAT = "chat",
  AUTONOMOUS = "auto"
}

/**
 * Prompts the user to choose an operation mode for the agent
 * @returns The selected agent mode
 */
async function chooseMode(): Promise<AgentMode> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      console.log("\nAvailable modes:");
      console.log(`1. ${AgentMode.CHAT}    - Interactive chat mode`);
      console.log(`2. ${AgentMode.AUTONOMOUS}    - Autonomous action mode`);

      const choice = (await rl.question("\nChoose a mode (enter number or name): "))
        .toLowerCase()
        .trim();

      if (choice === "1" || choice === AgentMode.CHAT) {
        return AgentMode.CHAT;
      } else if (choice === "2" || choice === AgentMode.AUTONOMOUS) {
        return AgentMode.AUTONOMOUS;
      }
      console.log("Invalid choice. Please try again.");
    }
  } finally {
    rl.close();
  }
}

/**
 * Configuration for agent execution
 */
interface AgentConfig {
  configurable?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Runs the agent in interactive chat mode
 * @param agent - The LangGraph agent executor
 * @param config - Agent configuration
 */
async function runChatMode(agent: Runnable, config: AgentConfig): Promise<void> {
  console.log("Starting chat mode... Type 'exit' to end.");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const threadId = `thread_${Date.now()}`;

    while (true) {
      const userInput = await rl.question("\nPrompt: ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      const runConfig = {
        ...config,
        configurable: {
          ...(config.configurable || {}),
          thread_id: threadId,
        },
      };

      try {
        const stream = await agent.stream({ messages: [new HumanMessage(userInput)] }, runConfig);

        for await (const chunk of stream) {
          if ("agent" in chunk && chunk.agent?.messages?.[0]?.content) {
            console.log(chunk.agent.messages[0].content);
          } else if ("tools" in chunk && chunk.tools?.messages?.[0]?.content) {
            console.log(chunk.tools.messages[0].content);
          }
          console.log("-------------------");
        }
      } catch (error) {
        console.error("Error processing request:", error instanceof Error ? error.message : String(error));
        console.log("Please try again with a different prompt.");
      }
    }
  } catch (error) {
    console.error("Fatal error in chat mode:", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    rl.close();
  }
}

/**
 * Runs the agent in autonomous mode with periodic actions
 * @param agent - The LangGraph agent executor
 * @param config - Agent configuration
 * @param interval - Time interval between actions in seconds
 */
async function runAutonomousMode(
  agent: Runnable, 
  config: AgentConfig, 
  interval = 10
): Promise<void> {
  console.log(`Starting autonomous mode with ${interval} second intervals...`);
  console.log("Press Ctrl+C to exit");

  const threadId = `autonomous_${Date.now()}`;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  while (true) {
    try {
      const thought = 
        "Explore blockchain capabilities by performing a useful action. " +
        "Demonstrate your abilities with meaningful operations that provide value.";

      const runConfig = {
        ...config,
        configurable: {
          ...(config.configurable || {}),
          thread_id: threadId,
        },
      };

      const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, runConfig);

      for await (const chunk of stream) {
        if ("agent" in chunk && chunk.agent?.messages?.[0]?.content) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk && chunk.tools?.messages?.[0]?.content) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }

      consecutiveErrors = 0;
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (error) {
      consecutiveErrors++;
      console.error(
        `Error in autonomous mode (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, 
        error instanceof Error ? error.message : String(error)
      );
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error("Too many consecutive errors. Exiting autonomous mode.");
        throw error;
      }
      
      const backoffTime = Math.min(30, interval * consecutiveErrors);
      console.log(`Backing off for ${backoffTime} seconds before retrying...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime * 1000));
    }
  }
}

/**
 * Environment configuration interface
 */
interface EnvConfig {
  NETWORK: "testnet" | "mainnet";
  TONCENTER_API_URL?: string;
  TONCENTER_API_KEY?: string;
  MNEMONIC_PHRASE?: string;
  MODEL_NAME?: string;
  INTERVAL_SECONDS?: number;
}

/**
 * Loads environment configuration with defaults
 * @returns Validated environment configuration
 */
function loadConfig(): EnvConfig {
  const network = (process.env.NETWORK || "testnet") as "testnet" | "mainnet";
  
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error(`Invalid network: ${network}. Must be 'testnet' or 'mainnet'`);
  }
  
  return {
    NETWORK: network,
    TONCENTER_API_URL: process.env.TONCENTER_API_URL,
    TONCENTER_API_KEY: process.env.TONCENTER_API_KEY,
    MNEMONIC_PHRASE: process.env.MNEMONIC_PHRASE,
    MODEL_NAME: process.env.MODEL_NAME || "gpt-4o-mini",
    INTERVAL_SECONDS: process.env.INTERVAL_SECONDS ? parseInt(process.env.INTERVAL_SECONDS, 10) : 10
  };
}

/**
 * Saves wallet data securely to disk
 * @param walletProvider - The wallet provider instance
 * @param network - The blockchain network
 * @returns Path to the saved wallet data file
 */
async function saveWalletData(walletProvider: WalletProvider, network: string): Promise<string> {
  const dataDir = path.join(process.cwd(), ".data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const walletDataFile = path.join(dataDir, `wallet_${network.replace(/-/g, "_")}.json`);
  const walletAddress = await walletProvider.getAddress();
  const walletData: WalletData = {
    privateKey: "unknown",
    walletAddress,
    network,
    timestamp: Date.now()
  };
  
  if (walletProvider instanceof TonWalletProvider) {
    const keyPair = walletProvider.getKeyPair();
    walletData.privateKey = Buffer.from(keyPair.secretKey).toString("hex");
  }
  
  fs.writeFileSync(walletDataFile, JSON.stringify(walletData, null, 2));
  return walletDataFile;
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  try {
    const config = loadConfig();
    
    console.log(`Initializing TON Agent on ${config.NETWORK} network...`);
    
    const llm = new ChatOpenAI({
      model: config.MODEL_NAME,
    });

    const mnemonic = config.MNEMONIC_PHRASE || (await mnemonicNew()).join(" ");
    
    const walletProvider = await WalletProvider.configureWithWallet({
      TONCENTER_API_URL: config.TONCENTER_API_URL,
      TONCENTER_API_KEY: config.TONCENTER_API_KEY,
      MNEMONIC_PHRASE: mnemonic,
      NETWORK: config.NETWORK,
    });

    const tonAgent = new TonAgent({
      walletProvider,
      actionProviders: [walletActionProvider],
    });

    const walletDataFile = await saveWalletData(walletProvider, config.NETWORK);
    console.log(`Wallet data saved to ${walletDataFile}`);
    
    const actions = tonAgent.getActions();
    console.log(`Loaded ${actions.length} actions from TON Agent`);

    const tools = await getLangChainTools(tonAgent);
    const memory = new MemorySaver();

    const agentConfig: AgentConfig = {};
    
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact with the TON blockchain. You have access to various tools
        that allow you to perform onchain operations. If you need funds, you can request them from the
        faucet if you are on the testnet network. If on mainnet, you can provide your wallet details for
        the user to send funds.
        
        Always check wallet details first to confirm which network you're operating on. If you encounter
        5XX (internal) HTTP errors, advise the user to try again later.
        
        If asked to perform actions beyond your available tools, clearly explain the limitation and suggest
        how the user could implement it themselves using the TON Agent SDK.
        
        Be concise, helpful, and only describe your tools when explicitly asked.
        
        You are currently operating on the ${config.NETWORK} network.
      `,
    });

    const mode = await chooseMode();

    if (mode === AgentMode.CHAT) {
      await runChatMode(agent, agentConfig);
    } else {
      await runAutonomousMode(agent, agentConfig, config.INTERVAL_SECONDS);
    }
  } catch (error) {
    console.error("Fatal error:", error instanceof Error ? error.message : String(error));
    console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
    process.exit(1);
  }
}

/**
 * Application bootstrap
 */
if (require.main === module) {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Promise Rejection:", reason);
    process.exit(1);
  });
  
  main().catch(error => {
    console.error("Fatal error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
