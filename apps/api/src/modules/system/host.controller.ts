import type { HostService } from './host.service.js';
export function createHostController(service: HostService) {
  return {
    async getInfo() {
      return { data: await service.getInfo() };
    },
    async getUptime() {
      return { data: await service.getUptime() };
    },
    async getLoad() {
      return { data: await service.getLoad() };
    },
  };
}
