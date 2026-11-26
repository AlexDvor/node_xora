import type { MemoryInfo, SwapInfo } from './system.types.js';
import { AppError } from '../../common/errors/app-error.js';
import type { SystemProvider } from '../../infrastructure/linux/system.provider.js';

export class SystemService {
  constructor(
    private readonly provider: SystemProvider,
    private readonly cached?: { memory(): MemoryInfo; swap(): SwapInfo },
  ) {}

  async getSwapInfo(): Promise<SwapInfo> {
    try {
      if (this.cached) return this.cached.swap();

      const snapshot = await this.provider.getSwapInfo();
      const usedBytes = snapshot.totalBytes - snapshot.freeBytes;
      const enabled = snapshot.totalBytes > 0;

      return {
        ...snapshot,
        usedBytes,
        usedPercent: enabled ? (usedBytes / snapshot.totalBytes) * 100 : null,
        enabled,
        collectedAt: new Date().toISOString(),
      };
    } catch {
      throw new AppError('SWAP_INFO_UNAVAILABLE', 'Unable to retrieve swap information', 503);
    }
  }

  async getMemoryInfo(): Promise<MemoryInfo> {
    try {
      if (this.cached) return this.cached.memory();

      const snapshot = await this.provider.getMemoryInfo();
      const usedBytes = snapshot.totalBytes - snapshot.availableBytes;

      return {
        ...snapshot,
        usedBytes,
        usedPercent: (usedBytes / snapshot.totalBytes) * 100,
        collectedAt: new Date().toISOString(),
      };
    } catch {
      throw new AppError('MEMORY_INFO_UNAVAILABLE', 'Unable to retrieve memory information', 503);
    }
  }
}
