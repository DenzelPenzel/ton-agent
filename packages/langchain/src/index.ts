import { tool } from "@langchain/core/tools";
import { TonAgent, Action } from "@ton-agent/core";

/**
 * Creates LangChain tools from TON Agent actions
 * @param agent - The TON Agent instance
 * @returns Array of LangChain tools
 */
export async function getLangChainTools(agent: TonAgent): Promise<any[]> {
  const actions: Action[] = agent.getActions();
  return actions.map(action => {
    return tool(
      async (arg: any) => {
        const result = await action.invoke(arg);
        return result;
      },
      {
        name: action.name,
        description: action.description,
        schema: action.schema as any,
      },
    );
  });
}
