/**
 * src/lib/cache.ts : a tiny per-instance TTL cache with request coalescing (spec 6.3).
 *
 * Every Databricks Statement API call costs ~500-900 ms of round trip even for `SELECT 1`, and
 * Free Edition bills the warehouse for it, so the cheapest query is the one we never send. Values
 * live in the module scope of one warm serverless instance: a cache miss is only ever a slow
 * response, never a wrong one, and a cold instance simply re-fetches.
 *
 * Kept free of Next.js imports so scripts and tests can use it directly.
 */
interface Entry<T> {
  value: T;
  expires: number;
}

export interface TtlCache<T> {
  /** Return the cached value, or run `load` and cache it. Concurrent misses share one call. */
  get(key: string, load: () => Promise<T>): Promise<T>;
  /** Drop one key (after a write that invalidates it), or every key when no key is given. */
  clear(key?: string): void;
  /** Cache a value computed elsewhere, e.g. the row a write just returned. */
  set(key: string, value: T): void;
  /** Drop every key matching a predicate, e.g. all of one user's dashboard tabs. */
  clearWhere(match: (key: string) => boolean): void;
}

export function ttlCache<T>(ttlMs: number): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expires > Date.now()) return hit.value;

      const pending = inflight.get(key);
      if (pending) return pending;

      const promise = load()
        .then((value) => {
          entries.set(key, { value, expires: Date.now() + ttlMs });
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
    clear(key) {
      if (key === undefined) {
        entries.clear();
        inflight.clear();
        return;
      }
      entries.delete(key);
      inflight.delete(key);
    },
    set(key, value) {
      entries.set(key, { value, expires: Date.now() + ttlMs });
    },
    clearWhere(match) {
      for (const key of [...entries.keys()]) if (match(key)) entries.delete(key);
      for (const key of [...inflight.keys()]) if (match(key)) inflight.delete(key);
    },
  };
}
