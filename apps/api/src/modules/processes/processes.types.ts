export interface ProcessQuery {
  sort: 'cpuPercent' | 'rssBytes' | 'pid' | 'name';
  direction: 'asc' | 'desc';
  uid?: number;
  search?: string;
  limit: number;
  cursor?: string;
}
