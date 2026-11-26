import type { HostProvider } from '../../infrastructure/linux/host.provider.js';
import { AppError } from '../../common/errors/app-error.js';

export class HostService {
  constructor(private readonly provider: HostProvider) {}

  async getInfo() {
    return this.read('HOST_INFO_UNAVAILABLE', () => this.provider.getHostInfo());
  }

  async getUptime() {
    return this.read('UPTIME_INFO_UNAVAILABLE', () => this.provider.getUptimeInfo());
  }

  async getLoad() {
    return this.read('LOAD_INFO_UNAVAILABLE', () => this.provider.getLoadInfo());
  }

  private async read<T>(code: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch {
      throw new AppError(code, 'Unable to retrieve system information', 503);
    }
  }
}
