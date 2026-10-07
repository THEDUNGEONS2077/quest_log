/**
 * store/migrations/index.ts: upgrades saved task data to the current format
 * (PLAN §7.3).
 *
 * Layer: store. Friends keep their tasks across updates, so every schema
 * change ships with:
 *   1. a pure migration `(data at version N) => data at version N + 1`,
 *      registered in MIGRATIONS below,
 *   2. a bump of SCHEMA_VERSION in lib/types.ts,
 *   3. a fixture saved from the previous beta (`__tests__/fixtures/tasks-vN.json`)
 *      and a test that migrates it (ARCHITECTURE.md §6).
 *
 * Migrations work on the flat TasksDocument (one JSON object), not on the
 * bucketed in-memory state, so they and their fixtures stay simple and
 * readable. The caller (persist.ts) snapshots the raw data *before*
 * migrating, so a buggy migration can never destroy the original.
 */
import { SCHEMA_VERSION, type TasksDocument } from '@/lib/types';

/**
 * A migration step. Input and output are untyped JSON on purpose: old
 * formats don't match today's types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- old data formats are untyped JSON by nature
type Migration = (data: any) => any;

/**
 * MIGRATIONS[n] upgrades data from version n to n + 1.
 * Version 1 is the first format, so there's nothing to migrate yet.
 */
export const MIGRATIONS: Record<number, Migration> = {};

/** Thrown when saved data comes from a *newer* app version than this one. */
export class FutureSchemaError extends Error {
  constructor(public readonly found: number) {
    super(`saved data has schema ${found}, this app understands up to ${SCHEMA_VERSION}`);
  }
}

/**
 * Runs every migration needed to bring `data` to SCHEMA_VERSION.
 * Returns the migrated data and whether anything changed. Throws
 * FutureSchemaError for data newer than the app (it must not be touched),
 * and Error when a step is missing or the data is malformed.
 */
export function migrate(data: unknown): { doc: TasksDocument; migrated: boolean } {
  if (!data || typeof data !== 'object') throw new Error('migrate: data is not an object');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking an old, untyped format
  let current: any = data;
  const start = Number(current.schemaVersion);
  if (!Number.isInteger(start) || start < 1) throw new Error(`migrate: invalid schemaVersion ${current.schemaVersion}`);
  if (start > SCHEMA_VERSION) throw new FutureSchemaError(start);

  // Apply each step in order, stamping the new version after each.
  for (let v = start; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`migrate: no migration from schema ${v}`);
    current = { ...step(current), schemaVersion: v + 1 };
  }

  // Shape only: strict consistency is checked after repair (persist.ts),
  // so a half-saved tree can be fixed instead of rejected.
  if (!current.byId || typeof current.byId !== 'object' || !current.children || !Array.isArray(current.children.root)) {
    throw new Error('migrate: missing byId/children');
  }
  return { doc: current as TasksDocument, migrated: start !== SCHEMA_VERSION };
}

/**
 * Structural checks on loaded data: catches corruption and migration bugs
 * before the app runs on bad data. Not a full schema check, but it covers
 * the invariants the tree code relies on.
 */
export function assertValidDocument(s: unknown): asserts s is TasksDocument {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON
  const st = s as any;
  if (!st || typeof st.byId !== 'object' || typeof st.children !== 'object') throw new Error('invalid: missing byId/children');
  if (!Array.isArray(st.children.root)) throw new Error('invalid: missing root list');
  const listed = new Set<string>();
  for (const [key, list] of Object.entries(st.children as Record<string, unknown>)) {
    if (!Array.isArray(list)) throw new Error(`invalid: children[${key}] is not a list`);
    for (const id of list as string[]) {
      const t = st.byId[id];
      if (!t) throw new Error(`invalid: ${id} listed but missing`);
      if ((t.parentId ?? 'root') !== key) throw new Error(`invalid: ${id} parentId does not match its list`);
      if (listed.has(id)) throw new Error(`invalid: ${id} listed twice`);
      listed.add(id);
    }
  }
  if (listed.size !== Object.keys(st.byId).length) throw new Error('invalid: some tasks are not in any list');
}
