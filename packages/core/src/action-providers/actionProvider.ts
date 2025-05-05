import { z } from "zod";
import { Network } from "@orbs-network/ton-access";
import { WalletProvider } from "../wallet-providers/walletProvider";
import { ACTION_DECORATOR_KEY, StoredActionMetadata } from "./actionDecorator";

/**
 * Error thrown when an action provider operation fails
 */
export class ActionProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ActionProviderError";
  }
}

/**
 * Represents an executable action that can be invoked by the agent
 * @template TActionSchema - The Zod schema that defines the action's parameters
 */
export interface Action<TActionSchema extends z.ZodSchema = z.ZodSchema> {
  /** Unique identifier for the action */
  name: string;
  /** Human-readable description of what the action does */
  description: string;
  /** Zod schema defining the expected parameters */
  schema: TActionSchema;
  /** Function to execute the action with the provided arguments */
  invoke: (args: z.infer<TActionSchema>) => Promise<string>;
}

/**
 * ActionProvider is the abstract base class for all action providers.
 * It provides a framework for registering and executing blockchain actions.
 *
 * @template TWalletProvider - The type of wallet provider this action provider works with
 * @abstract
 */
export abstract class ActionProvider<TWalletProvider extends WalletProvider = WalletProvider> {
  /**
   * The name of the action provider.
   * Used for identification and logging purposes.
   */
  public readonly name: string;

  /**
   * Child action providers that can be combined with this one.
   * This allows for composing multiple action providers together.
   */
  public readonly actionProviders: ActionProvider<TWalletProvider>[];

  /**
   * Creates a new action provider instance.
   *
   * @param name - Unique identifier for this action provider
   * @param actionProviders - Optional child action providers to include
   */
  constructor(name: string, actionProviders: ActionProvider<TWalletProvider>[] = []) {
    if (!name || name.trim() === "") {
      throw new ActionProviderError("Action provider name cannot be empty");
    }

    this.name = name;
    this.actionProviders = actionProviders;
  }

  /**
   * Gets all available actions from this provider and its children, bound to the given wallet provider.
   * This collects actions from decorated methods and prepares them for execution.
   *
   * @param walletProvider - The wallet provider to bind actions to
   * @returns Array of executable actions
   * @throws {ActionProviderError} If there's an error retrieving or processing actions
   */
  getActions(walletProvider: TWalletProvider): Action[] {
    try {
      const actions: Action[] = [];
      const allProviders = [this, ...this.actionProviders];

      for (const provider of allProviders) {
        const actionsMetadataMap: StoredActionMetadata | undefined = Reflect.getMetadata(
          ACTION_DECORATOR_KEY,
          provider.constructor,
        );

        if (!actionsMetadataMap) {
          if (!(provider instanceof ActionProvider)) {
            console.warn(`Warning: Provider is not an instance of ActionProvider.`);
          } else {
            // This is normal for base classes or providers without decorated methods
            console.debug(`Note: ${provider.name} has no registered actions.`);
          }
          continue;
        }

        for (const actionMetadata of actionsMetadataMap.values()) {
          actions.push({
            name: actionMetadata.name,
            description: actionMetadata.description,
            schema: actionMetadata.schema,
            invoke: schemaArgs => {
              try {
                const args: unknown[] = [];
                if (actionMetadata.walletProvider) {
                  args[0] = walletProvider;
                }

                args.push(schemaArgs);
                return actionMetadata.invoke.apply(provider, args);
              } catch (error) {
                throw new ActionProviderError(
                  `Failed to invoke action '${actionMetadata.name}'`,
                  error,
                );
              }
            },
          });
        }
      }

      return actions;
    } catch (error) {
      throw new ActionProviderError("Failed to get actions", error);
    }
  }

  /**
   * Checks if the action provider supports the given network.
   *
   * @param network - The network to check.
   * @returns True if the action provider supports the network, false otherwise.
   */
  abstract supportsNetwork(network: Network): boolean;
}
