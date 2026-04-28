/**
 * Per-key async lock manager that serializes critical sections by key.
 *
 * Design decision:
 * Lock scope is per item key (not global) so independent items can progress in
 * parallel while still preventing oversell races for the same item.
 */
export class LockManager {
  private locks = new Map<string, Promise<void>>();

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) || Promise.resolve();

    let release!: () => void;
    const next = new Promise<void>((res) => (release = res));

    this.locks.set(key, prev.then(() => next));

    await prev;

    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }
}
