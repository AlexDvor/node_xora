import type { MemorySnapshot, SwapSnapshot, SystemProvider } from './system.provider.js';

export class MockSystemProvider implements SystemProvider {
  async getSwapInfo(): Promise<SwapSnapshot> {
    return { totalBytes: 1024 ** 3, freeBytes: 768 * 1024 ** 2, source: 'mock' };
  }

  async getMemoryInfo(): Promise<MemorySnapshot> {
    return { totalBytes: 4 * 1024 ** 3, availableBytes: 3 * 1024 ** 3, source: 'mock' };
  }
}
