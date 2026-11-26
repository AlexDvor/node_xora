import { readJournal, type JournalQuery } from '../../infrastructure/linux/journal.provider.js';
import { AppError } from '../../common/errors/app-error.js';

export class LogsService {
  constructor(
    private readonly source: 'linux' | 'mock',
    private readonly provider: typeof readJournal = readJournal,
  ) {}

  async read(query: JournalQuery) {
    if (query.since && query.until && Date.parse(query.since) >= Date.parse(query.until)) {
      throw new AppError('INVALID_TIME_RANGE', 'since must precede until', 400);
    }

    if (this.source === 'mock') {
      return {
        scope: 'mock NodeXora journal',
        entries: [],
        nextCursor: query.cursor ?? null,
        hasMore: false,
        direction: 'forward',
        gaps: null,
      };
    }

    try {
      return await this.provider(query, AbortSignal.timeout(3000));
    } catch {
      throw new AppError(
        query.cursor ? 'JOURNAL_RESYNC_REQUIRED' : 'JOURNAL_UNAVAILABLE',
        query.cursor
          ? 'Cursor unavailable or journal could not be read; retry without cursor'
          : 'Unable to read NodeXora user journal',
        query.cursor ? 409 : 503,
      );
    }
  }
}
