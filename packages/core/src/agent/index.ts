import { WalletProvider } from "../wallet-providers/walletProvider";
import { Action, ActionProvider } from "../action-providers/actionProvider";
import { walletActionProvider } from "../action-providers/walletActionProvider";

export interface TonAgentOptions extends Partial<Config> {
  walletProvider?: WalletProvider;
  actionProviders?: ActionProvider[];
}

export interface Config {
  TONCENTER_API_URL: string;
  TONCENTER_API_KEY: string;
  MNEMONIC_PHRASE: string;
  WORKCHAIN?: number;
  NETWORK?: "mainnet" | "testnet";
}

export class TonAgent {
  private walletProvider: WalletProvider;
  private actionProviders: ActionProvider[];

  constructor(config: TonAgentOptions & { walletProvider: WalletProvider }) {
    this.walletProvider = config.walletProvider;
    this.actionProviders = config.actionProviders || [walletActionProvider];
  }

  public static async from(
    config: TonAgentOptions = { actionProviders: [walletActionProvider] },
  ): Promise<TonAgent> {
    let walletProvider: WalletProvider | undefined = config.walletProvider;

    if (!walletProvider) {
      if (!config.TONCENTER_API_URL || !config.TONCENTER_API_KEY) {
        throw new Error(
          "TONCENTER_API_URL and TONCENTER_API_KEY are required if not providing a walletProvider",
        );
      }
      walletProvider = await WalletProvider.configureWithWallet(config);
    }

    return new TonAgent({
      ...config,
      walletProvider,
    });
  }

  public getActions(): Action[] {
    const actions: Action[] = [];
    const unsupported: string[] = [];

    for (const actionProvider of this.actionProviders) {
      if (actionProvider.supportsNetwork(this.walletProvider.getNetwork())) {
        actions.push(...actionProvider.getActions(this.walletProvider));
      } else {
        unsupported.push(actionProvider.name);
      }
    }

    if (unsupported.length > 0) {
      console.log(
        `Warning: The following action providers are not supported on the current network and will be unavailable: ${unsupported.join(", ")}`,
      );
      console.log("Current network:", this.walletProvider.getNetwork());
    }

    return actions;
  }
}
