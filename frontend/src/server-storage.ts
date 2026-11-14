/**
 * Pré-rendu uniquement : un stockage vide en mémoire à la place de localStorage /
 * sessionStorage (Node n'en fournit pas d'utilisable). Le rendu correspond ainsi à
 * un visiteur non connecté, sans préférence enregistrée — ce que voient les moteurs.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const current = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
  if (typeof current?.getItem !== 'function') {
    Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
  }
}
