/**
 * lib/types.ts: the task data model (PLAN §7.1).
 *
 * Layer: pure lib. Plain data only; no React, no native code. Every other
 * module (store, services, UI) uses these types.
 *
 * Shape: a *normalized* tree. Tasks live in an ID-keyed map (split into
 * hash buckets for performance, see lib/taskMap.ts), and the order of each
 * parent's children lives in `children[parentKey]`. Moving a task is an
 * array splice, and editing a title never touches the tree structure.
 */
import type { Bucket } from './taskMap';

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
  /**
   * Monthly/yearly: the day of the month to return to after clamping
   * (31 → Feb 28 → Mar 31). Optional; defaults to the due date's day.
   * Added in Phase 8 as an optional field, so no migration is needed.
   */
  monthDay?: number;
  /**
   * The occurrence's usual time of day (minutes after midnight). Set when a
   * repeating reminder is snoozed (09:00 → 09:15), so later occurrences
   * return to 09:00 instead of drifting. Optional; defaults to the due time.
   */
  timeOfDay?: number;
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
  /**
   * XP this task earned when it was completed (lib/xp.ts); unchecking it
   * takes exactly this back. Absent (0) on open tasks and on data from
   * before XP existed (added 2026-10-09 as an optional field: no migration).
   */
  xp?: number;
  /**
   * Repeating tasks: occurrences completed on time in a row. Each one raises
   * the task's XP multiplier (lib/xp.ts); a late completion resets it.
   */
  streak?: number;
}

/**
 * XP and streaks (lib/xp.ts). Part of the tree, so every change is an op
 * with an exact inverse: UNDO a completion and its XP is taken back.
 * Never lowered by clearing or purging tasks: XP belongs to the person.
 */
export interface Progress {
  /** Total XP ever earned. The level is derived from it. */
  xp: number;
  /** Consecutive days with at least one completion, as of `lastDay`. */
  dayStreak: number;
  /** The longest day streak so far. */
  bestDayStreak: number;
  /** Local date (YYYY-MM-DD) of the last completion, or null. */
  lastDay: string | null;
}

/** Progress before anything was completed (also for data from before XP existed). */
export const EMPTY_PROGRESS: Progress = { xp: 0, dayStreak: 0, bestDayStreak: 0, lastDay: null };

/** The whole task tree, in memory. */
export interface TasksState {
  /**
   * Tasks keyed by ID, split into hash buckets so an edit copies about 30
   * entries instead of all of them. Access only through lib/taskMap.ts.
   */
  buckets: readonly Bucket[];
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
  /** XP and streaks. */
  progress: Progress;
}

/**
 * The same tree as one flat JSON document. Used where a single readable
 * value matters more than update speed: migrations and their fixtures,
 * daily snapshots, and backup export/import.
 */
export interface TasksDocument {
  byId: Record<ID, Task>;
  children: Record<ParentKey, ID[]>;
  structureVersion: number;
  schemaVersion: number;
  /** Optional: absent in data from before XP existed (read as EMPTY_PROGRESS). */
  progress?: Progress;
}

/** Fields an `update` op may change. Structure (`id`, `parentId`) changes only via move/insert/remove. */
export type TaskFields = Omit<Task, 'id' | 'parentId'>;

/** Current data format version (bump with a migration, see ARCHITECTURE.md §6). */
export const SCHEMA_VERSION = 1;
