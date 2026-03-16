import * as z from 'zod';
import { createTextResponse, createErrorResponse } from '../../../utils/responses/index.ts';
import { getProcess, terminateTrackedProcess, type ProcessInfo } from './active-processes.ts';
import type { ToolResponse } from '../../../types/common.ts';

const swiftPackageStopSchema = z.object({
  pid: z.number(),
});

type SwiftPackageStopParams = z.infer<typeof swiftPackageStopSchema>;

export interface ProcessManager {
  getProcess: (pid: number) => ProcessInfo | undefined;
  terminateTrackedProcess: (
    pid: number,
    timeoutMs: number,
  ) => Promise<{ status: 'not-found' | 'terminated'; startedAt?: Date; error?: string }>;
}

const defaultProcessManager: ProcessManager = {
  getProcess,
  terminateTrackedProcess,
};

export function getDefaultProcessManager(): ProcessManager {
  return defaultProcessManager;
}

export function createMockProcessManager(overrides?: Partial<ProcessManager>): ProcessManager {
  return {
    getProcess: () => undefined,
    terminateTrackedProcess: async () => ({ status: 'not-found' }),
    ...overrides,
  };
}

export async function swift_package_stopLogic(
  params: SwiftPackageStopParams,
  processManager: ProcessManager = getDefaultProcessManager(),
  timeout: number = 5000,
): Promise<ToolResponse> {
  const processInfo = processManager.getProcess(params.pid);
  if (!processInfo) {
    return createTextResponse(
      `⚠️ No running process found with PID ${params.pid}. Use swift_package_run to check active processes.`,
      true,
    );
  }

  try {
    const result = await processManager.terminateTrackedProcess(params.pid, timeout);
    if (result.status === 'not-found') {
      return createTextResponse(
        `⚠️ No running process found with PID ${params.pid}. Use swift_package_run to check active processes.`,
        true,
      );
    }

    if (result.error) {
      return createErrorResponse('Failed to stop process', result.error);
    }

    const startedAt = result.startedAt ?? processInfo.startedAt;

    return {
      content: [
        {
          type: 'text',
          text: `✅ Stopped executable (was running since ${startedAt.toISOString()})`,
        },
        {
          type: 'text',
          text: `💡 Process terminated. You can now run swift_package_run again if needed.`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse('Failed to stop process', message);
  }
}

export const schema = swiftPackageStopSchema.shape;

export async function handler(args: Record<string, unknown>): Promise<ToolResponse> {
  const parseResult = swiftPackageStopSchema.safeParse(args);
  if (!parseResult.success) {
    return createErrorResponse(
      'Parameter validation failed',
      parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
    );
  }

  return swift_package_stopLogic(parseResult.data);
}
