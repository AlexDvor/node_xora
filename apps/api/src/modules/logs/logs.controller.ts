import type { LogsService } from './logs.service.js';
import type { JournalQuery } from '../../infrastructure/linux/journal.provider.js';

export const createLogsController = (service: LogsService) => ({
  async list(request: { query: JournalQuery }) {
    return { data: await service.read(request.query) };
  },
});
