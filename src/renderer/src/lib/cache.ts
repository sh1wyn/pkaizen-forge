const store = new Map<string, { at: number; value: unknown }>()
const pending = new Map<string, Promise<unknown>>()

/** Mémoïse un appel IPC coûteux entre les changements d'onglet (TTL 5 min). */
export function cached<T>(key: string, fn: () => Promise<T>, ttlMs = 5 * 60_000): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T)
  const inflight = pending.get(key)
  if (inflight) return inflight as Promise<T>
  const p = fn()
    .then((v) => {
      store.set(key, { at: Date.now(), value: v })
      pending.delete(key)
      return v
    })
    .catch((e) => {
      pending.delete(key)
      throw e
    })
  pending.set(key, p)
  return p
}

export function invalidate(prefix?: string): void {
  if (!prefix) {
    store.clear()
    return
  }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k)
}
