import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createSnapshotHarness } from '../harness.ts';
import { expectMatchesFixture } from '../fixture-io.ts';
import type { SnapshotHarness } from '../harness.ts';
import { clearAllProcesses } from '../../mcp/tools/swift-package/active-processes.ts';

const PACKAGE_PATH = 'example_projects/spm';

describe('swift-package workflow', () => {
  let harness: SnapshotHarness;

  beforeAll(async () => {
    vi.setConfig({ testTimeout: 120_000 });
    harness = await createSnapshotHarness();
  }, 120_000);

  afterAll(() => {
    harness.cleanup();
  });

  describe('build', () => {
    it('success', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'build', {
        packagePath: PACKAGE_PATH,
      });
      expect(isError).toBe(false);
      expect(text.length).toBeGreaterThan(10);
      expectMatchesFixture(text, __filename, 'build--success');
    }, 120_000);

    it('error - bad path', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'build', {
        packagePath: 'example_projects/NONEXISTENT',
      });
      expect(isError).toBe(true);
      expectMatchesFixture(text, __filename, 'build--error-bad-path');
    });
  });

  describe('test', () => {
    it('success', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'test', {
        packagePath: PACKAGE_PATH,
        filter: 'basicTruthTest',
      });
      expect(isError).toBe(false);
      expect(text.length).toBeGreaterThan(10);
      expectMatchesFixture(text, __filename, 'test--success');
    }, 120_000);

    it('failure - intentional test failure', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'test', {
        packagePath: PACKAGE_PATH,
      });
      expect(isError).toBe(true);
      expect(text.length).toBeGreaterThan(10);
      expectMatchesFixture(text, __filename, 'test--failure');
    }, 120_000);

    it('error - bad path', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'test', {
        packagePath: 'example_projects/NONEXISTENT',
      });
      expect(isError).toBe(true);
      expectMatchesFixture(text, __filename, 'test--error-bad-path');
    });
  });

  describe('clean', () => {
    it('success', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'clean', {
        packagePath: PACKAGE_PATH,
      });
      expect(isError).toBe(false);
      expectMatchesFixture(text, __filename, 'clean--success');
    });

    it('error - bad path', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'clean', {
        packagePath: 'example_projects/NONEXISTENT',
      });
      expect(isError).toBe(true);
      expectMatchesFixture(text, __filename, 'clean--error-bad-path');
    });
  });

  describe('run', () => {
    it('success', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'run', {
        packagePath: PACKAGE_PATH,
        executableName: 'spm',
      });
      expect(isError).toBe(false);
      expect(text.length).toBeGreaterThan(0);
      expectMatchesFixture(text, __filename, 'run--success');
    }, 120_000);

    it('error - bad executable', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'run', {
        packagePath: PACKAGE_PATH,
        executableName: 'nonexistent-executable',
      });
      expect(isError).toBe(true);
      expectMatchesFixture(text, __filename, 'run--error-bad-executable');
    }, 120_000);
  });

  describe('list', () => {
    it('success', async () => {
      await harness.invoke('swift-package', 'run', {
        packagePath: PACKAGE_PATH,
        executableName: 'spm',
        background: true,
      });

      try {
        const { text, isError } = await harness.invoke('swift-package', 'list', {});
        expect(isError).toBe(false);
        expectMatchesFixture(text, __filename, 'list--success');
      } finally {
        clearAllProcesses();
      }
    }, 120_000);
  });

  describe('stop', () => {
    it('error - no process', async () => {
      const { text, isError } = await harness.invoke('swift-package', 'stop', {
        pid: 999999,
      });
      expect(isError).toBe(true);
      expectMatchesFixture(text, __filename, 'stop--error-no-process');
    });
  });
});
