/**
 * lib/sample.ts: the example tasks behind the empty state's "Load example
 * tasks" button (PLAN §9.19).
 *
 * Layer: pure lib. Written as an outline (the same format paste accepts,
 * lib/paste.ts), so the demo tree is built by the tested paste code and
 * lands as one undoable step. It shows off a group, a done subtask and a
 * note, and the subtask titles teach the main gestures.
 */

/** The demo tree, as outline text. */
export const SAMPLE_OUTLINE = `Welcome to quest_log
  [x] Open the app
  Tap this task to edit it
  Swipe right on a task to complete it
  Hold a task still, then drag it to move it
  Tap ? at the top right for the full guide
Groceries
  Milk
  Eggs
  Coffee
Call the bank
  // Ask about the new card
Plan the weekend`;
