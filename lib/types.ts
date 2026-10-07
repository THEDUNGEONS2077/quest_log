/**
 * lib/types.ts: the task data model (PLAN §7.1).
 *
 * Layer: pure lib. Plain data only; no React, no native code. Every other
 * module (store, services, UI) uses these types.
 *
 * Shape: a *normalized* tree. Tasks live in a flat `byId` map, and the order
 * of each parent's children lives in `children[parentKey]`. Moving a task is
 * an array splice, and editing a title never touches the tree structure.
 */

/** A task ID (a UUID from expo-crypto, created in the store layer). */
export type ID = string;

/** The key under which top-level task IDs are stored in `children`. */
export const ROOT = 'root';
/** A key into `children`: a parent task's ID, or ROOT for top level. */
export type ParentKey = ID | typeof ROOT;

/** 0 none, 1 low (!), 2 medium (!!), 3 high (!!!). */
export type Priority = 0 | 1 | 2 | 3;

/** How a task repeats (PLAN §9.9). Requires `dueAt`. */
export interface RepeatRule {
  freq: 'day' | 'week' | 'month' | 'year';
  /** Every N units; at least 1. */
  interval: number;
  /** 0 (Sun) to 6 (Sat). Only for freq 'week'. */
  weekdays?: number[];
  /** Next date counts from the due date ('schedule') or from completion time. */
  from: 'schedule' | 'completion';
}

/** One task. Every field is plain JSON, so it persists and backs up as-is. */
export interface Task {
  id: ID;
  /** null = top level. Always consistent with `children` (ops maintain this). */
  parentId: ID | null;
  title: string;
  /** '' = no notes (no notes UI is shown). */
  notes: string;
  done: boolean;
  doneAt: number | null;
  priority: Priority;
  /** Scheduled date/time, epoch ms. */
  dueAt: number | null;
  /** Send a notification at dueAt. Separate from dueAt, so a date can exist without an alert. */
  notify: boolean;
  /** OS notification handles (several for repeats on iOS). */
  notificationIds: string[];
  repeat: RepeatRule | null;
  /** On an archived copy of a repeating task: the live task it came from. */
  repeatSourceId: ID | null;
  collapsed: boolean;
  /** Soft delete time (task is in Trash), or null. */
  deletedAt: number | null;
  createdAt: number;
  /** Bubbles up to every ancestor on any change; drives the COMPLETED sort. */
  updatedAt: number;
}

/** The whole task tree. */
export interface TasksState {
  byId: Record<ID, Task>;
  /**
   * Ordered child IDs per parent. ROOT is always present. A parent with no
   * children has no key (not an empty array), which keeps undo round-trips
   * exactly equal.
   */
  children: Record<ParentKey, ID[]>;
  /** Bumped on every structural change; derived rows recompute only when it changes. */
  structureVersion: number;
  /** Data format version; drives migrations (PLAN §7.3). */
  schemaVersion: number;
}

/** Fields an `update` op may change. Structure (`id`, `parentId`) changes only via move/insert/remove. */
export type TaskFields = Omit<Task, 'id' | 'parentId'>;

/** Current data format version (bump with a migration, see ARCHITECTURE.md §6). */
export const SCHEMA_VERSION = 1;
