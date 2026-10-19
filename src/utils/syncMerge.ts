/**
 * Three-way merge of database snapshots so several people can work at the same time.
 *
 * base   = what this device last synced
 * local  = this device now
 * remote = what another device saved to the cloud since
 *
 * Every record changed on only one side is kept; records changed on both sides to different
 * values are a real conflict and the merge gives up (the user then chooses which copy to keep).
 */
import type { DatabaseSnapshot } from './cloudSync';

type Snapshot = Omit<DatabaseSnapshot, 'savedAt'>;

const KEYS: Record<string, (item: any) => string> = {
  companies: (x) => x.id,
  employees: (x) => x.id,
  records: (x) => x.id,
  loans: (x) => x.id,
  inputs: (x) => x.id,
  clearances: (x) => x.id,
  users: (x) => x.username,
  ruleSets: (x) => x.from,
  comments: (x) => x.id,
};

export interface MergeResult {
  merged: Snapshot | null;
  conflicts: string[]; // "employees: comp_x_EMP001"
}

export function threeWayMerge(base: Partial<Snapshot>, local: Partial<Snapshot>, remote: Partial<Snapshot>): MergeResult {
  const merged: any = {};
  const conflicts: string[] = [];

  for (const [store, keyOf] of Object.entries(KEYS)) {
    const toMap = (arr: any[] | undefined) => new Map((arr || []).map((x) => [keyOf(x), JSON.stringify(x)]));
    const b = toMap((base as any)[store]);
    const l = toMap((local as any)[store]);
    const r = toMap((remote as any)[store]);
    const result = new Map(r);

    for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
      const bv = b.get(id);
      const lv = l.get(id);
      const rv = r.get(id);
      const localChanged = lv !== bv;
      const remoteChanged = rv !== bv;
      if (!localChanged) continue; // remote value (or its deletion) stands
      if (remoteChanged && lv !== rv) {
        conflicts.push(`${store}: ${id}`);
        continue;
      }
      if (lv === undefined) result.delete(id);
      else result.set(id, lv);
    }
    merged[store] = Array.from(result.values()).map((v) => JSON.parse(v));
  }

  return { merged: conflicts.length ? null : (merged as Snapshot), conflicts };
}
