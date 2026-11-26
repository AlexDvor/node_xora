import { execFile } from 'node:child_process';
import { monitoringPolicy as policy } from '../../config/monitoring.js';

/** Callers provide a fixed executable and validated argv; never invokes a shell. */
export function readCommand(file: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        encoding: 'utf8',
        timeout: policy.commandTimeoutMs,
        maxBuffer: policy.commandMaxBytes,
        signal,
        env: { ...process.env, LC_ALL: 'C', SYSTEMD_COLORS: '0' },
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}
