export interface MemoryInfo {
  totalBytes: number;
  availableBytes: number;
  /** totalBytes - availableBytes; reclaimable cache is not counted as used. */
  usedBytes: number;
  usedPercent: number;
  /** ISO 8601 UTC timestamp after collection. */
  collectedAt: string;
  source: 'linux' | 'mock';
}

export interface SwapInfo {
  totalBytes: number;
  freeBytes: number;
  /** totalBytes - freeBytes. */
  usedBytes: number;
  /** null when totalBytes is zero (swap disabled). */
  usedPercent: number | null;
  enabled: boolean;
  /** ISO 8601 UTC timestamp after collection. */
  collectedAt: string;
  source: 'linux' | 'mock';
}
