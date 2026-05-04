import { StdioServerTransport } from '@modelcontextprotocol/server';

import { loadConfig } from './config.js';
import { createSlackMcpServer, createToolDependencies } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const deps = createToolDependencies(config);
  const server = createSlackMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
