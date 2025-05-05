import { z } from "zod";
import { Network } from "@orbs-network/ton-access";
import { ActionProvider, ActionProviderError } from "./actionProvider";
import { GetWalletDetailsSchema, NativeTransferSchema } from "./schemas";
import { WalletProvider } from "../wallet-providers";
import { CreateAction } from "./actionDecorator";

/**
 * Error thrown when a wallet action fails
 */
export class WalletActionError extends ActionProviderError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message, cause);
    this.name = "WalletActionError";
  }
}

export class WalletActionProvider extends ActionProvider {
  /**
   * Creates a new WalletActionProvider instance.
   *
   * @param childProviders - Optional additional action providers to include
   */
  constructor(childProviders: ActionProvider[] = []) {
    super("wallet", childProviders);
  }

  /**
   * Gets the details of the connected wallet including address, network, and balance.
   *
   * @param walletProvider - The wallet provider to get the details from
   * @param _ - Empty args object (not used)
   * @returns A formatted string containing the wallet details
   * @throws {WalletActionError} If retrieving wallet details fails
   */
  @CreateAction({
    name: "get_wallet_details",
    description: `
        This tool will return the details of the connected wallet including:
        - Wallet address
        - Network information
        - Native TON balance
        - Wallet provider name and type
        - Deployment status
        `,
    schema: GetWalletDetailsSchema,
  })
  async getWalletDetails(
    walletProvider: WalletProvider,
    _: z.infer<typeof GetWalletDetailsSchema>,
  ): Promise<string> {
    try {
      const address = walletProvider.getAddress();
      const balance = await walletProvider.getBalance();
      const name = walletProvider.getName();
      const network = walletProvider.getNetwork();
      const isDeployed = await walletProvider.isDeployed();

      const formattedBalance = (Number(balance) / 1_000_000_000).toFixed(9);

      return [
        "## Wallet Details",
        `- **Provider**: ${name}`,
        `- **Address**: \`${address}\``,
        `- **Network**: ${network}`,
        `- **TON Balance**: ${formattedBalance} TON`,
        `- **Deployed**: ${isDeployed ? "Yes" : "No"}`,
      ].join("\n");
    } catch (error) {
      throw new WalletActionError("Failed to get wallet details", error);
    }
  }

  /**
   * Transfers TON to another address.
   *
   * @param walletProvider - The wallet provider to use for the transfer
   * @param args - Transfer parameters including destination and amount
   * @returns A formatted string with the transaction details
   * @throws {WalletActionError} If the transfer fails
   */
  @CreateAction({
    name: "transfer_ton",
    description: `
        Transfer TON tokens to another address.
        - Requires a connected wallet with sufficient balance
        - Amount is specified in TON units (not nano)
        - Returns transaction hash when successful
        `,
    schema: NativeTransferSchema,
  })
  async transferTon(
    walletProvider: WalletProvider,
    args: z.infer<typeof NativeTransferSchema>,
  ): Promise<string> {
    try {
      if (!args.to || !args.value) {
        throw new WalletActionError("Destination address and transfer amount are required");
      }

      const isDeployed = await walletProvider.isDeployed();
      if (!isDeployed) {
        throw new WalletActionError("Wallet is not deployed. Please deploy the wallet first.");
      }

      const currentBalance = await walletProvider.getBalance();
      const transferAmount = args.value;

      const txHash = await walletProvider.nativeTransfer(args.to, transferAmount);

      return [
        "## Transfer Successful",
        `- **Transaction Hash**: \`${txHash}\``,
        `- **Current Balance**: \`${currentBalance}\``,
        `- **Amount**: ${transferAmount} TON`,
        `- **Recipient**: \`${args.to}\``,
      ].join("\n");
    } catch (error) {
      throw new WalletActionError("Failed to transfer TON", error);
    }
  }

  /**
   * Checks if the wallet action provider supports the given network.
   * Currently supports only TON networks.
   *
   * @param network - The network to check
   * @returns True if the network is supported, false otherwise
   */
  supportsNetwork(network: Network): boolean {
    return true;
  }

  /**
   * Checks if a wallet is deployed and deploys it if not.
   *
   * @param walletProvider - The wallet provider to check and potentially deploy
   * @returns A message indicating the deployment status or result
   * @throws {WalletActionError} If the deployment check or process fails
   */
  @CreateAction({
    name: "ensure_wallet_deployed",
    description: `
        Checks if the wallet is deployed and deploys it if not.
        - Returns the current deployment status
        - If deployment is needed, initiates the deployment and returns the transaction hash
        `,
    schema: GetWalletDetailsSchema,
  })
  async ensureWalletDeployed(
    walletProvider: WalletProvider,
    _: z.infer<typeof GetWalletDetailsSchema>,
  ): Promise<string> {
    try {
      const isDeployed = await walletProvider.isDeployed();

      if (isDeployed) {
        return "Wallet is already deployed and ready to use.";
      }

      const txHash = await walletProvider.deploy();

      return [
        "## Wallet Deployment Initiated",
        `- **Transaction Hash**: \`${txHash}\``,
        "- The wallet deployment has been initiated. Please wait for confirmation.",
      ].join("\n");
    } catch (error) {
      throw new WalletActionError("Failed to deploy wallet", error);
    }
  }
}

/**
 * Factory function to create a new WalletActionProvider instance.
 *
 * @param childProviders - Optional child action providers to include
 * @returns A new WalletActionProvider instance
 */
export const createWalletActionProvider = (
  childProviders: ActionProvider[] = [],
): WalletActionProvider => {
  return new WalletActionProvider(childProviders);
};

/**
 * Singleton instance of WalletActionProvider for convenience.
 * Use this when you don't need to customize the provider.
 */
export const walletActionProvider = createWalletActionProvider();
