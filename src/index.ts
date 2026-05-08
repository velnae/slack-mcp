#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import path from 'node:path';

import { StdioServerTransport } from '@modelcontextprotocol/server';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadConfig } from './config.js';
import { createSlackMcpServer, createToolDependencies } from './server.js';

export function shouldRunAsCli(importMetaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) {
    return false;
  }

  if (importMetaUrl === pathToFileURL(argvPath).href) {
    return true;
  }

  const importedPath = normalizeForExecutionComparison(fileURLToPath(importMetaUrl));
  const executedPath = normalizeForExecutionComparison(argvPath);

  return importedPath !== undefined && executedPath !== undefined && importedPath === executedPath;
}

function normalizeForExecutionComparison(filePath: string): string | undefined {
  try {
    return realpathSync.native(filePath);
  } catch {
    try {
      return path.resolve(filePath);
    } catch {
      return undefined;
    }
  }
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const deps = createToolDependencies(config);
  const server = createSlackMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (shouldRunAsCli(import.meta.url)) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
