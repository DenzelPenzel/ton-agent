import {
  TonClient,
  WalletContractV4,
  Address,
  beginCell,
  toNano,
  internal,
  SendMode,
} from "@ton/ton";
import { mnemonicToPrivateKey, KeyPair } from "@ton/crypto";
import { Network } from "@orbs-network/ton-access";
import { Config } from "../agent";

/**
 * Configuration for wallet providers
 */
export interface WalletProviderConfig {
  /** Wallet contract instance */
  wallet?: WalletContractV4;
  /** Contract interface for interacting with the blockchain */
  contract?: unknown;
  /** TON client for making RPC calls */
  tonClient: TonClient;
  /** Cryptographic key pair for signing transactions */
  keyPair: KeyPair;
  /** Network identifier */
  network?: Network;
  /** Workchain ID (default: 0) */
  workchain?: number;
}

/**
 * Error thrown when a wallet provider operation fails
 */
export class WalletProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WalletProviderError";
  }
}

/**
 * Abstract base class for all wallet providers
 * Defines the interface for interacting with blockchain wallets
 */
export abstract class WalletProvider {
  protected config: WalletProviderConfig;

  /**
   * Creates a new wallet provider instance
   *
   * @param config - Configuration for the wallet provider
   */
  constructor(config: WalletProviderConfig) {
    this.config = config;
  }

  /**
   * Get the address of the wallet
   *
   * @returns The wallet address as a string
   */
  abstract getAddress(): string;

  /**
   * Get the network of the wallet
   *
   * @returns The network identifier
   */
  abstract getNetwork(): Network;

  /**
   * Get the name of the wallet provider
   *
   * @returns A human-readable name for the wallet provider
   */
  abstract getName(): string;

  /**
   * Get the balance of the native asset (TON)
   *
   * @returns The balance in the smallest unit (nanoTON)
   * @throws {WalletProviderError} If retrieving the balance fails
   */
  abstract getBalance(): Promise<bigint>;

  /**
   * Transfer the native asset to another address
   *
   * @param to - The destination address
   * @param value - The amount to transfer in whole units (TON)
   * @returns The transaction hash
   * @throws {WalletProviderError} If the transfer fails
   */
  abstract nativeTransfer(to: string, value: string): Promise<string>;

  /**
   * Check if the wallet is deployed on the blockchain
   *
   * @returns True if the wallet is deployed, false otherwise
   * @throws {WalletProviderError} If checking deployment status fails
   */
  abstract isDeployed(): Promise<boolean>;

  /**
   * Deploy the wallet to the blockchain if not already deployed
   *
   * @returns The transaction hash of the deployment
   * @throws {WalletProviderError} If deployment fails
   */
  abstract deploy(): Promise<string>;

  /**
   * Get the workchain ID of the wallet
   *
   * @returns The workchain ID (usually 0 for most wallets)
   */
  abstract getWorkchain(): number;

  /**
   * Create a wallet provider from configuration.
   * Factory method to simplify wallet provider creation.
   *
   * @param config - The configuration for the wallet provider
   * @returns A configured wallet provider instance
   * @throws {WalletProviderError} If configuration is invalid or initialization fails
   */
  public static async configureWithWallet(config: Partial<Config>): Promise<WalletProvider> {
    try {
      if (!config.TONCENTER_API_URL || !config.TONCENTER_API_KEY) {
        throw new WalletProviderError("TONCENTER_API_URL and TONCENTER_API_KEY are required");
      }

      if (!config.MNEMONIC_PHRASE) {
        throw new WalletProviderError("MNEMONIC_PHRASE is required");
      }

      const tonClient = new TonClient({
        endpoint: config.TONCENTER_API_URL,
        apiKey: config.TONCENTER_API_KEY,
      });

      const mnemonicPhrase = config.MNEMONIC_PHRASE;
      const mnemonic = mnemonicPhrase.split(" ").map(word => word.trim());

      const keyPair = await mnemonicToPrivateKey(mnemonic);
      const workchain = config.WORKCHAIN || 0;

      const wallet = WalletContractV4.create({
        workchain,
        publicKey: keyPair.publicKey,
      });

      const contract = tonClient.open(wallet);

      return new TonWalletProvider({
        wallet,
        contract,
        tonClient,
        keyPair,
        network: config.NETWORK,
        workchain,
      });
    } catch (error) {
      if (error instanceof WalletProviderError) {
        throw error;
      }
      throw new WalletProviderError("Failed to configure wallet provider", error);
    }
  }
}

export class TonWalletProvider extends WalletProvider {
  private wallet: WalletContractV4;
  private contract: any;
  private tonClient: TonClient;
  private keyPair: KeyPair;
  private network: Network;
  private workchain: number;

  constructor(config: WalletProviderConfig) {
    super(config);

    if (!config.wallet || !config.contract || !config.tonClient || !config.keyPair) {
      throw new Error("Missing required configuration for TonWalletProvider");
    }

    this.wallet = config.wallet;
    this.contract = config.contract;
    this.tonClient = config.tonClient;
    this.keyPair = config.keyPair;
    this.network = config.network || "mainnet";
    this.workchain = config.workchain || 0;
  }

  /**
   * Get the address of the wallet.
   *
   * @returns The address of the wallet as a string.
   */
  getAddress(): string {
    return this.wallet.address.toString();
  }

  /**
   * Get the network of the wallet.
   *
   * @returns The network of the wallet.
   */
  getNetwork(): Network {
    return this.network;
  }

  /**
   * Get the name of the wallet provider.
   *
   * @returns The name of the wallet provider.
   */
  getName(): string {
    return "TON Wallet V4";
  }

  /**
   * Get the balance of the wallet.
   *
   * @returns The balance of the wallet in nanoTON.
   */
  async getBalance(): Promise<bigint> {
    try {
      return await this.contract.getBalance();
    } catch (error) {
      console.error("Failed to get wallet balance:", error);
      throw new Error(`Failed to get wallet balance: ${error}`);
    }
  }

  /**
   * Transfer TON to another address.
   *
   * @param to - The destination address.
   * @param value - The amount to transfer in TON.
   * @returns The transaction hash.
   */
  async nativeTransfer(to: string, value: string): Promise<string> {
    try {
      const destinationAddress = Address.parse(to);
      const amount = toNano(value);
      const seqno = await this.contract.getSeqno();

      const transfer = internal({
        to: destinationAddress,
        value: amount,
        bounce: false,
        body: beginCell().endCell(),
      });

      const result = await this.contract.sendTransfer({
        seqno,
        secretKey: this.keyPair.secretKey,
        messages: [transfer],
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
      });

      return result.hash().toString("hex");
    } catch (error) {
      console.error("Failed to transfer TON:", error);
      throw new Error(`Failed to transfer TON: ${error}`);
    }
  }

  /**
   * Get the wallet contract instance.
   *
   * @returns The wallet contract instance.
   */
  getContract() {
    return this.contract;
  }

  /**
   * Get the TonClient instance.
   *
   * @returns The TonClient instance.
   */
  getTonClient() {
    return this.tonClient;
  }

  /**
   * Get the wallet contract.
   *
   * @returns The wallet contract.
   */
  getWallet() {
    return this.wallet;
  }

  /**
   * Get the key pair.
   *
   * @returns The key pair.
   */
  getKeyPair() {
    return this.keyPair;
  }

  /**
   * Deploy the wallet if it's not deployed yet.
   *
   * @returns The transaction hash.
   */
  async deploy(): Promise<string> {
    try {
      const isDeployed = await this.isDeployed();

      if (isDeployed) {
        return "Wallet is already deployed";
      }

      const seqno = await this.contract.getSeqno();
      const result = await this.contract.deploy({
        seqno,
        secretKey: this.keyPair.secretKey,
      });

      return result.hash().toString("hex");
    } catch (error) {
      console.error("Failed to deploy wallet:", error);
      throw new Error(`Failed to deploy wallet: ${error}`);
    }
  }

  /**
   * Check if the wallet is deployed.
   *
   * @returns Whether the wallet is deployed.
   */
  async isDeployed(): Promise<boolean> {
    try {
      const address = this.getAddress();
      const toAddress = Address.parse(address);
      const info = await this.tonClient.provider(toAddress).getState();
      return info.state.type === "active";
    } catch (error) {
      console.error("Failed to check if wallet is deployed:", error);
      throw new Error(`Failed to check if wallet is deployed: ${error}`);
    }
  }

  /**
   * Send a raw transaction with a custom payload.
   *
   * @param to - The destination address.
   * @param value - The amount to transfer in TON.
   * @param payload - The payload to send with the transaction.
   * @param bounce - Whether to bounce the transaction if it fails.
   * @returns The transaction hash.
   */
  async sendTransaction(
    to: string,
    value: string,
    payload?: any,
    bounce: boolean = false,
  ): Promise<string> {
    try {
      const destinationAddress = Address.parse(to);
      const amount = toNano(value);
      const seqno = await this.contract.getSeqno();
      let body = beginCell().endCell();
      if (payload) {
        body = payload;
      }
      const transfer = internal({
        to: destinationAddress,
        value: amount,
        bounce,
        body,
      });

      const result = await this.contract.sendTransfer({
        seqno,
        secretKey: this.keyPair.secretKey,
        messages: [transfer],
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
      });

      return result.hash().toString("hex");
    } catch (error) {
      console.error("Failed to send transaction:", error);
      throw new Error(`Failed to send transaction: ${error}`);
    }
  }

  /**
   * Get the workchain of the wallet.
   *
   * @returns The workchain of the wallet.
   */
  getWorkchain(): number {
    return this.workchain;
  }
}
