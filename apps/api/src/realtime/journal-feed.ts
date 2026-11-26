import { EventEmitter } from 'node:events';
import { followJournal } from '../infrastructure/linux/journal.provider.js';

export class JournalFeed extends EventEmitter {
  private closeReader: (() => void) | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private references = 0;
  sequence = 0;

  constructor(private readonly source: 'linux' | 'mock') {
    super();
    this.setMaxListeners(24);
  }

  acquire() {
    this.references++;
    this.open();
  }

  release() {
    this.references = Math.max(0, this.references - 1);

    if (!this.references) this.close();
  }

  private open() {
    if (this.source === 'mock' || !this.references || this.closeReader || this.retry) return;

    this.closeReader = followJournal(
      (entries) =>
        this.emit(
          'page',
          {
            scope: 'NodeXora user journal, shared live reader',
            entries,
            nextCursor: entries.at(-1)?.cursor ?? null,
            hasMore: false,
            direction: 'forward',
            gaps: null,
          },
          ++this.sequence,
        ),
      () => {
        this.emit('gap', ++this.sequence);
        this.closeReader?.();
        this.closeReader = undefined;

        if (!this.retry && this.references) {
          this.retry = setTimeout(() => {
            this.retry = undefined;
            this.open();
          }, 2000);
          this.retry.unref();
        }
      },
    );
  }

  private close() {
    this.closeReader?.();
    this.closeReader = undefined;

    if (this.retry) clearTimeout(this.retry);

    this.retry = undefined;
  }

  stop() {
    this.references = 0;
    this.close();
    this.removeAllListeners();
  }
}
