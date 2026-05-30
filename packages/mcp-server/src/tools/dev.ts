import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface DevToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class DevTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: DevToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DevTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'execute-script',
        description:
          'Execute arbitrary JavaScript in the Foundry VTT client context (GM-only). ' +
          'Returns the script result as serialized JSON. ' +
          'Use for inspection, item creation, compendium management, and debugging. ' +
          'The script has access to: game, Item, Actor, ui, CONFIG, foundry.',
        inputSchema: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description:
                'JavaScript expression to execute. Must be a single expression that returns a value. Examples: ' +
                '"game.packs.get(\'black-flag.lineages\').getIndex().then(i => i.size)" ' +
                'or "game.user.name" ' +
                'or "(await game.packs.get(\'black-flag.lineages\').getIndex()).size"',
            },
          },
          required: ['script'],
        },
      },
    ];
  }

  /**
   * Handle execute-script tool call
   */
  async handleExecuteScript(args: { script: string }): Promise<string> {
    this.logger.info('Executing script', { scriptLength: args.script.length });
    try {
      const response = await this.foundryClient.executeScript(args.script);
      return JSON.stringify(response, null, 2);
    } catch (error) {
      this.logger.error('Script execution failed', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
