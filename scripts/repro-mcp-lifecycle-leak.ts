import { spawn } from 'node:child_process';
import process from 'node:process';

interface CliOptions {
  iterations: number;
  closeDelayMs: number;
  settleMs: number;
}

interface PeerProcess {
  pid: number;
  ageSeconds: number;
  rssKb: number;
  command: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    iterations: 20,
    closeDelayMs: 0,
    settleMs: 2000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === '--iterations' && value) {
      options.iterations = Number(value);
      index += 1;
    } else if (arg === '--close-delay-ms' && value) {
      options.closeDelayMs = Number(value);
      index += 1;
    } else if (arg === '--settle-ms' && value) {
      options.settleMs = Number(value);
      index += 1;
    }
  }

  if (!Number.isFinite(options.iterations) || options.iterations < 1) {
    throw new Error('--iterations must be a positive number');
  }
  if (!Number.isFinite(options.closeDelayMs) || options.closeDelayMs < 0) {
    throw new Error('--close-delay-ms must be a non-negative number');
  }
  if (!Number.isFinite(options.settleMs) || options.settleMs < 0) {
    throw new Error('--settle-ms must be a non-negative number');
  }

  return options;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyMcpCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  return (
    /(^|\s)mcp(\s|$)/.test(normalized) &&
    !/(^|\s)daemon(\s|$)/.test(normalized) &&
    (normalized.includes('xcodebuildmcp') ||
      normalized.includes('build/cli.js') ||
      normalized.includes('/cli.js'))
  );
}

function parseElapsedSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const daySplit = trimmed.split('-');
  const timePart = daySplit.length === 2 ? daySplit[1] : daySplit[0];
  const dayCount = daySplit.length === 2 ? Number(daySplit[0]) : 0;
  const parts = timePart.split(':').map((part) => Number(part));

  if (!Number.isFinite(dayCount) || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 1) {
    return dayCount * 86400 + parts[0];
  }
  if (parts.length === 2) {
    return dayCount * 86400 + parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return dayCount * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

async function sampleMcpProcesses(): Promise<PeerProcess[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('ps', ['-axo', 'pid=,etime=,rss=,command='], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ps exited with code ${code}`));
        return;
      }

      const processes = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = line.match(/^(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
          if (!match) {
            return null;
          }
          const ageSeconds = parseElapsedSeconds(match[2]);
          return {
            pid: Number(match[1]),
            ageSeconds,
            rssKb: Number(match[3]),
            command: match[4],
          };
        })
        .filter((entry): entry is PeerProcess => {
          return (
            entry !== null &&
            Number.isFinite(entry.pid) &&
            Number.isFinite(entry.ageSeconds) &&
            Number.isFinite(entry.rssKb) &&
            isLikelyMcpCommand(entry.command)
          );
        });

      resolve(processes);
    });
  });
}

async function runIteration(closeDelayMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['build/cli.js', 'mcp'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    let exited = false;
    child.once('close', () => {
      exited = true;
      resolve(true);
    });
    child.once('error', () => {
      exited = true;
      resolve(false);
    });

    setTimeout(() => {
      child.stdin.end();
    }, closeDelayMs);

    setTimeout(
      () => {
        if (!exited) {
          resolve(false);
        }
      },
      Math.max(1000, closeDelayMs + 1000),
    );
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const before = await sampleMcpProcesses();
  const baselinePids = new Set(before.map((entry) => entry.pid));

  let exitedCount = 0;
  for (let index = 0; index < options.iterations; index += 1) {
    const exited = await runIteration(options.closeDelayMs);
    if (exited) {
      exitedCount += 1;
    }
  }

  await delay(options.settleMs);

  const after = await sampleMcpProcesses();
  const lingering = after.filter((entry) => !baselinePids.has(entry.pid));

  console.log(
    JSON.stringify(
      {
        iterations: options.iterations,
        exitedCount,
        baselineProcessCount: before.length,
        finalProcessCount: after.length,
        lingeringProcessCount: lingering.length,
        lingering: lingering.map(({ pid, ageSeconds, rssKb, command }) => ({
          pid,
          ageSeconds,
          rssKb,
          command,
        })),
      },
      null,
      2,
    ),
  );

  process.exit(lingering.length === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
