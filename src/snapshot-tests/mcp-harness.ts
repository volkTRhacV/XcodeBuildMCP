import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { extractText } from '../smoke-tests/test-helpers.ts';
import { normalizeSnapshotOutput } from './normalize.ts';

const CLI_PATH = path.resolve(process.cwd(), 'build/cli.js');

export interface McpSnapshotHarness {
  callTool(name: string, args: Record<string, unknown>): Promise<McpSnapshotResult>;
  client: Client;
  cleanup(): Promise<void>;
}

export interface McpSnapshotResult {
  text: string;
  rawText: string;
  isError: boolean;
}

export async function createMcpSnapshotHarness(): Promise<McpSnapshotHarness> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [CLI_PATH, 'mcp'],
    stderr: 'pipe',
  });

  const client = new Client({ name: 'snapshot-test-client', version: '1.0.0' });
  await client.connect(transport, { timeout: 30_000 });

  async function callTool(name: string, args: Record<string, unknown>): Promise<McpSnapshotResult> {
    const result = await client.callTool({ name, arguments: args });
    const rawText = extractText(result) + '\n';
    const text = normalizeSnapshotOutput(rawText);
    const isError = (result as { isError?: boolean }).isError ?? false;

    return { text, rawText, isError };
  }

  return {
    callTool,
    client,
    async cleanup(): Promise<void> {
      await client.close();
    },
  };
}
