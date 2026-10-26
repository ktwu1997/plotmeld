import 'server-only';

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  dedupe<T>(key: string, load: () => Promise<T>): Promise<T>;
}

/** Process-local only; bounded storage, no cross-instance quota guarantees. */
export class MemoryCache implements Cache {
  private values = new Map<string, { value: unknown; expires: number }>();
  private pending = new Map<string, Promise<unknown>>();
  constructor(private readonly capacity = 500, private readonly now = Date.now) {}
  get<T>(key: string): T | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) { this.values.delete(key); return undefined; }
    return structuredClone(entry.value) as T;
  }
  set<T>(key: string, value: T, ttlMs: number): void {
    this.values.delete(key);
    if (this.values.size >= this.capacity) this.values.delete(this.values.keys().next().value!);
    this.values.set(key, { value: structuredClone(value), expires: this.now() + ttlMs });
  }
  async dedupe<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing) as T;
    if (this.pending.size >= this.capacity) throw new Error('Request capacity exceeded');
    const promise = Promise.resolve().then(load);
    this.pending.set(key, promise);
    try { return structuredClone(await promise); }
    finally { this.pending.delete(key); }
  }
}
