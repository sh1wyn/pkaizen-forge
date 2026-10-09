const store = new Map<string, { at: number; value: unknown }>()
const pending = new Map<string, Promise<unknown>>()

/** Mémoïse un appel IPC coûteux entre les changements d'onglet (TTL 5 min). */
export function cached<T>(key: string, fn: () => Promise<T>, ttlMs = 5 * 60_000): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T)
  const inflight = pending.get(key)
  if (inflight) return inflight as Promise<T>
  const p = Promise.resolve().then(fn)
    .then((v) => {
      if (pending.get(key) === p) {
        store.set(key, { at: Date.now(), value: v })
        pending.delete(key)
      }
      return v
    })
    .catch((e) => {
      if (pending.get(key) === p) pending.delete(key)
      throw e
    })
  pending.set(key, p)
  return p
}

export function invalidate(prefix?: string): void {
  if (!prefix) {
    store.clear()
    pending.clear()
    return
  }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k)
  for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key)
}
