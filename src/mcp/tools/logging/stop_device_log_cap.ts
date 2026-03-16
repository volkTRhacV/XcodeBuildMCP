/**
 * Logging Plugin: Stop Device Log Capture
 *
 * Stops an active Apple device log capture session and returns the captured logs.
 */

import * as fs from 'fs';
import * as z from 'zod';
import { log } from '../../../utils/logging/index.ts';
import {
  stopDeviceLogSessionById,
  stopAllDeviceLogCaptures,
} from '../../../utils/log-capture/device-log-sessions.ts';
import type { ToolResponse } from '../../../types/common.ts';
import { getDefaultFileSystemExecutor, getDefaultCommandExecutor } from '../../../utils/command.ts';
import type { FileSystemExecutor } from '../../../utils/FileSystemExecutor.ts';
import { createTypedTool } from '../../../utils/typed-tool-factory.ts';

const stopDeviceLogCapSchema = z.object({
  logSessionId: z.string(),
});

type StopDeviceLogCapParams = z.infer<typeof stopDeviceLogCapSchema>;

export async function stop_device_log_capLogic(
  params: StopDeviceLogCapParams,
  fileSystemExecutor: FileSystemExecutor,
): Promise<ToolResponse> {
  const { logSessionId } = params;

  try {
    log('info', `Attempting to stop device log capture session: ${logSessionId}`);

    const result = await stopDeviceLogSessionById(logSessionId, fileSystemExecutor, {
      timeoutMs: 1000,
      readLogContent: true,
    });

    if (result.error) {
      log('error', `Failed to stop device log capture session ${logSessionId}: ${result.error}`);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to stop device log capture session ${logSessionId}: ${result.error}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ Device log capture session stopped successfully\n\nSession ID: ${logSessionId}\n\n--- Captured Logs ---\n${result.logContent}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', `Failed to stop device log capture session ${logSessionId}: ${message}`);
    return {
      content: [
        {
          type: 'text',
          text: `Failed to stop device log capture session ${logSessionId}: ${message}`,
        },
      ],
      isError: true,
    };
  }
}

function hasPromisesInterface(obj: unknown): obj is { promises: typeof fs.promises } {
  return typeof obj === 'object' && obj !== null && 'promises' in obj;
}

function hasExistsSyncMethod(obj: unknown): obj is { existsSync: typeof fs.existsSync } {
  return typeof obj === 'object' && obj !== null && 'existsSync' in obj;
}

function hasCreateWriteStreamMethod(
  obj: unknown,
): obj is { createWriteStream: typeof fs.createWriteStream } {
  return typeof obj === 'object' && obj !== null && 'createWriteStream' in obj;
}

export async function stopDeviceLogCapture(
  logSessionId: string,
  fileSystem?: unknown,
): Promise<{ logContent: string; error?: string }> {
  const fsToUse = fileSystem ?? fs;
  const mockFileSystemExecutor: FileSystemExecutor = {
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      if (hasPromisesInterface(fsToUse)) {
        await fsToUse.promises.mkdir(path, options);
      } else {
        await fs.promises.mkdir(path, options);
      }
    },
    async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
      if (hasPromisesInterface(fsToUse)) {
        const result = await fsToUse.promises.readFile(path, encoding);
        return typeof result === 'string' ? result : (result as Buffer).toString();
      } else {
        const result = await fs.promises.readFile(path, encoding);
        return typeof result === 'string' ? result : (result as Buffer).toString();
      }
    },
    async writeFile(
      path: string,
      content: string,
      encoding: BufferEncoding = 'utf8',
    ): Promise<void> {
      if (hasPromisesInterface(fsToUse)) {
        await fsToUse.promises.writeFile(path, content, encoding);
      } else {
        await fs.promises.writeFile(path, content, encoding);
      }
    },
    createWriteStream(path: string, options?: { flags?: string }) {
      if (hasCreateWriteStreamMethod(fsToUse)) {
        return fsToUse.createWriteStream(path, options);
      }
      return fs.createWriteStream(path, options);
    },
    async cp(
      source: string,
      destination: string,
      options?: { recursive?: boolean },
    ): Promise<void> {
      if (hasPromisesInterface(fsToUse)) {
        await fsToUse.promises.cp(source, destination, options);
      } else {
        await fs.promises.cp(source, destination, options);
      }
    },
    async readdir(path: string, options?: { withFileTypes?: boolean }): Promise<unknown[]> {
      if (hasPromisesInterface(fsToUse)) {
        if (options?.withFileTypes === true) {
          const result = await fsToUse.promises.readdir(path, { withFileTypes: true });
          return Array.isArray(result) ? result : [];
        }
        const result = await fsToUse.promises.readdir(path);
        return Array.isArray(result) ? result : [];
      }

      if (options?.withFileTypes === true) {
        const result = await fs.promises.readdir(path, { withFileTypes: true });
        return Array.isArray(result) ? result : [];
      }
      const result = await fs.promises.readdir(path);
      return Array.isArray(result) ? result : [];
    },
    async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
      if (hasPromisesInterface(fsToUse)) {
        await fsToUse.promises.rm(path, options);
      } else {
        await fs.promises.rm(path, options);
      }
    },
    existsSync(path: string): boolean {
      if (hasExistsSyncMethod(fsToUse)) {
        return fsToUse.existsSync(path);
      }
      return fs.existsSync(path);
    },
    async stat(path: string): Promise<{ isDirectory(): boolean; mtimeMs: number }> {
      if (hasPromisesInterface(fsToUse)) {
        const result = await fsToUse.promises.stat(path);
        return result as { isDirectory(): boolean; mtimeMs: number };
      }
      const result = await fs.promises.stat(path);
      return result as { isDirectory(): boolean; mtimeMs: number };
    },
    async mkdtemp(prefix: string): Promise<string> {
      if (hasPromisesInterface(fsToUse)) {
        return fsToUse.promises.mkdtemp(prefix);
      }
      return fs.promises.mkdtemp(prefix);
    },
    tmpdir(): string {
      return '/tmp';
    },
  };

  const result = await stopDeviceLogSessionById(logSessionId, mockFileSystemExecutor, {
    timeoutMs: 1000,
    readLogContent: true,
  });

  if (result.error) {
    return { logContent: '', error: result.error };
  }

  return { logContent: result.logContent };
}

export { stopAllDeviceLogCaptures };

export const schema = stopDeviceLogCapSchema.shape;

export const handler = createTypedTool(
  stopDeviceLogCapSchema,
  (params: StopDeviceLogCapParams) => {
    return stop_device_log_capLogic(params, getDefaultFileSystemExecutor());
  },
  getDefaultCommandExecutor,
);
