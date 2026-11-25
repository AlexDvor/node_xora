import type { DataResponse } from '../../common/types/api-response.js';
import type { SystemService } from './system.service.js';
import type { MemoryInfo, SwapInfo } from './system.types.js';

export function createSystemController(service: SystemService) {
  return {
    async getSwap(): Promise<DataResponse<SwapInfo>> {
      return { data: await service.getSwapInfo() };
    },
    async getMemory(): Promise<DataResponse<MemoryInfo>> {
      return { data: await service.getMemoryInfo() };
    },
  };
}
