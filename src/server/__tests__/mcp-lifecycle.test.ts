import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockExecutor } from '../../test-utils/mock-executors.ts';
import {
  buildMcpLifecycleSnapshot,
  classifyMcpLifecycleAnomalies,
  createMcpLifecycleCoordinator,
} from '../mcp-lifecycle.ts';

class TestStdin extends EventEmitter {
  override once(event: string, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  override removeListener(event: string, listener: (...args: unknown[]) => void): this {
    return super.removeListener(event, listener);
  }
}

class TestProcess extends EventEmitter {
  readonly stdin = new TestStdin();
  readonly stdout = new TestStdin();

  override once(event: string, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  override removeListener(event: string, listener: (...args: unknown[]) => void): this {
    return super.removeListener(event, listener);
  }
}

describe('mcp lifecycle coordinator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deduplicates shutdown requests from stdin end and close', async () => {
    const processRef = new TestProcess();
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    const coordinator = createMcpLifecycleCoordinator({
      commandExecutor: createMockExecutor({ output: '' }),
      processRef,
      onShutdown,
    });

    coordinator.attachProcessHandlers();
    processRef.stdin.emit('end');
    processRef.stdin.emit('close');
    await vi.waitFor(() => {
      expect(onShutdown).toHaveBeenCalledTimes(1);
    });

    expect(onShutdown.mock.calls[0]?.[0]?.reason).toBe('stdin-end');
  });

  it('shuts down cleanly even if stdin closes before a server is registered', async () => {
    const processRef = new TestProcess();
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    const coordinator = createMcpLifecycleCoordinator({
      commandExecutor: createMockExecutor({ output: '' }),
      processRef,
      onShutdown,
    });

    coordinator.attachProcessHandlers();
    processRef.stdin.emit('close');
    await vi.waitFor(() => {
      expect(onShutdown).toHaveBeenCalledTimes(1);
    });

    expect(onShutdown.mock.calls[0]?.[0]?.server).toBe(null);
  });

  it('maps unhandled rejections to crash shutdowns', async () => {
    const processRef = new TestProcess();
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    const coordinator = createMcpLifecycleCoordinator({
      commandExecutor: createMockExecutor({ output: '' }),
      processRef,
      onShutdown,
    });

    coordinator.attachProcessHandlers();
    processRef.emit('unhandledRejection', new Error('boom'));
    await vi.waitFor(() => {
      expect(onShutdown).toHaveBeenCalledTimes(1);
    });

    expect(onShutdown.mock.calls[0]?.[0]?.reason).toBe('unhandled-rejection');
  });

  it('maps broken stdout pipes to shutdowns', async () => {
    const processRef = new TestProcess();
    const onShutdown = vi.fn().mockResolvedValue(undefined);
    const coordinator = createMcpLifecycleCoordinator({
      commandExecutor: createMockExecutor({ output: '' }),
      processRef,
      onShutdown,
    });

    coordinator.attachProcessHandlers();
    processRef.stdout.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
    await vi.waitFor(() => {
      expect(onShutdown).toHaveBeenCalledTimes(1);
    });

    expect(onShutdown.mock.calls[0]?.[0]?.reason).toBe('stdout-error');
  });
});

describe('mcp lifecycle snapshot', () => {
  it('classifies peer-count and memory anomalies', () => {
    expect(
      classifyMcpLifecycleAnomalies({
        uptimeMs: 10 * 60 * 1000,
        rssBytes: 600 * 1024 * 1024,
        matchingMcpProcessCount: 4,
        matchingMcpPeerSummary: [{ pid: 11, ageSeconds: 180, rssKb: 1000 }],
      }),
    ).toEqual(['high-rss', 'long-lived-high-rss', 'peer-age-high', 'peer-count-high']);
  });

  it('samples matching MCP peer processes from ps output', async () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 64 * 1024 * 1024,
      heapTotal: 8,
      heapUsed: 4,
      external: 0,
      arrayBuffers: 0,
    });
    const startedAtMs = Date.now() - 1000;

    const snapshot = await buildMcpLifecycleSnapshot({
      phase: 'running',
      shutdownReason: null,
      startedAtMs,
      commandExecutor: createMockExecutor({
        output: [
          `${process.pid} 00:05 65536 node /tmp/build/cli.js mcp`,
          `999 03:00 1024 node /tmp/build/cli.js mcp`,
          `321 00:07 2048 node /tmp/build/cli.js daemon`,
        ].join('\n'),
      }),
    });

    expect(snapshot.matchingMcpProcessCount).toBe(2);
    expect(snapshot.matchingMcpPeerSummary).toEqual([{ pid: 999, ageSeconds: 180, rssKb: 1024 }]);
    expect(snapshot.anomalies).toEqual(['peer-age-high']);
  });
});
