import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMcpSnapshotHarness, type McpSnapshotHarness } from '../mcp-harness.ts';
import { expectMatchesFixture } from '../fixture-io.ts';

describe('MCP Integration Snapshots', () => {
  let harness: McpSnapshotHarness;

  beforeAll(async () => {
    harness = await createMcpSnapshotHarness();
  }, 30_000);

  afterAll(async () => {
    await harness.cleanup();
  });

  describe('session-management', () => {
    it('session_show_defaults -- empty', async () => {
      await harness.client.callTool({
        name: 'session_clear_defaults',
        arguments: { all: true },
      });
      const { text, isError } = await harness.callTool('session_show_defaults', {});
      expect(isError).toBe(false);
      expectMatchesFixture(text, __filename, 'session-show-defaults--empty');
    });

    it('session_set_defaults -- set scheme', async () => {
      await harness.client.callTool({
        name: 'session_clear_defaults',
        arguments: { all: true },
      });
      const { text, isError } = await harness.callTool('session_set_defaults', {
        scheme: 'CalculatorApp',
      });
      expect(isError).toBe(false);
      expectMatchesFixture(text, __filename, 'session-set-defaults--scheme');
    });
  });

  describe('error-paths', () => {
    it('build_sim -- missing required params', async () => {
      await harness.client.callTool({
        name: 'session_clear_defaults',
        arguments: { all: true },
      });
      const { text, isError } = await harness.callTool('build_sim', {});
      expect(isError).toBe(true);
      expectMatchesFixture(text, __filename, 'build-sim--missing-params');
    });
  });
});
