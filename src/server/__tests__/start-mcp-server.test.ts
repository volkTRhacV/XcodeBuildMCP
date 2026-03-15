import { afterEach, describe, expect, it, vi } from 'vitest';
import { __closeServerForFastExitForTests } from '../start-mcp-server.ts';

describe('fast-exit server close', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns skipped when server is not available', async () => {
    await expect(__closeServerForFastExitForTests(undefined)).resolves.toBe('skipped');
  });

  it('returns closed when server close resolves quickly', async () => {
    const close = vi.fn(async () => undefined);
    await expect(__closeServerForFastExitForTests({ close }, 50)).resolves.toBe('closed');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns rejected when server close throws', async () => {
    const close = vi.fn(async () => {
      throw new Error('close failed');
    });

    await expect(__closeServerForFastExitForTests({ close }, 50)).resolves.toBe('rejected');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('times out when server close never settles', async () => {
    vi.useFakeTimers();
    const close = vi.fn(() => new Promise<void>(() => undefined));

    const outcomePromise = __closeServerForFastExitForTests({ close }, 50);
    await vi.advanceTimersByTimeAsync(50);

    await expect(outcomePromise).resolves.toBe('timed_out');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
