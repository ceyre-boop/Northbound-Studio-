import { atom } from 'nanostores';

export type Line = {
  sku: string;
  name: string;
  variant: string;   // "12oz · Whole bean"
  price: number;     // cents, already resolved for the variant
  qty: number;
};

const KEY = 'marrow-cart-v1';

/** Survives a refresh: a cart that forgets is the thing owners distrust most. */
function load(): Line[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((l) => l && typeof l.sku === 'string' && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export const lines = atom<Line[]>(typeof localStorage === 'undefined' ? [] : load());
export const drawerOpen = atom(false);
export const fulfilment = atom<'pickup' | 'ship'>('pickup');

function persist(next: Line[]) {
  lines.set(next);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
}

const idOf = (l: Pick<Line, 'sku' | 'variant'>) => `${l.sku}::${l.variant}`;

export function add(line: Omit<Line, 'qty'>, qty = 1) {
  const next = [...lines.get()];
  const i = next.findIndex((l) => idOf(l) === idOf(line));
  if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + qty };
  else next.push({ ...line, qty });
  persist(next);
  drawerOpen.set(true);
}

export function setQty(sku: string, variant: string, qty: number) {
  const next = lines.get()
    .map((l) => (idOf(l) === `${sku}::${variant}` ? { ...l, qty } : l))
    .filter((l) => l.qty > 0);
  persist(next);
}

export function remove(sku: string, variant: string) {
  persist(lines.get().filter((l) => idOf(l) !== `${sku}::${variant}`));
}

export function clear() { persist([]); }

export const subtotal = (ls: Line[]) => ls.reduce((n, l) => n + l.price * l.qty, 0);
export const count = (ls: Line[]) => ls.reduce((n, l) => n + l.qty, 0);
export const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
