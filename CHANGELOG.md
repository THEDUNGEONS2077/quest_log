# Changelog

Each version gets one section. It feeds the in-app "What's new" screen and the GitHub Release notes (PLAN §15.4).

## 0.5.0 (build 6)

Details, shorthand and a task menu.

- **Your requests:**
  - Icons (▸ ▾ [ ] and friends) are 20% bigger.
  - The `[ ]` checkbox is tighter.
  - The title now reads `> quest_log`.
- **Notes.** While editing a task, tap `+ NOTE` (or NOTE in the toolbar) to add notes. Tasks with notes show `≡`; tap it to read the notes. Links in notes are tappable.
- **Priority.** The PRI toolbar button cycles `!` → `!!` → `!!!` → none.
- **Shorthand** works in the quick-add bar and in titles, with a live preview while you type:
  - `!` `!!` `!!!` set the priority.
  - `@today` `@tomorrow` `@fri` `@5pm` `@mon 9am` `@in 2h` set a due date.
  - `//` turns the rest into notes.
  - `#Groceries` creates a group, and the next tasks you add go inside it (tap ✕ to stop).
  - Put `\` before a word to keep it as typed.
- **Long-press any task** for a menu: priority, add subtask, indent/outdent, notes, duplicate, copy as text, delete.
- While editing, chips show the task's priority and due date. Tap ✕ on a chip to clear it.
- Due-date reminders (notifications) arrive in the next version. For now a due date shows on the task and marks it OVERDUE when it passes.

## 0.4.0 (build 5)

Checking things off.

- **Tap the checkbox** (or **swipe right**) to complete a task. A line draws through the title, and you feel a light tap.
- **Groups complete themselves**: checking a group completes everything inside it, and checking the last open subtask completes its group.
- Completed top-level tasks move to the new **COMPLETED QUESTS** tab, newest first. The tab's counter pulses when something arrives.
- On the COMPLETED tab:
  - **Swipe right** or tap `[x]` to **restore** a task to its original place.
  - **Long-press** a task to restore it, run it again (a fresh copy, handy for checklists), or delete it.
  - **CLEAR…** moves old completed tasks to Trash.
- **Swipe left** on any task to delete it.
- Every completion, restore and delete shows a message with **UNDO** for 5 seconds.

## 0.3.1 (build 4)

Changes from your feedback on 0.3.0:

- **Editing and adding are separate now.** Done/Enter saves the task and closes the keyboard; it no longer starts a new task.
- **Deleting stops editing.** Backspace on an empty task deletes it and closes the keyboard, instead of jumping into the task above.
- **Editing toolbar.** While you edit a task, a bar above the keyboard offers `← OUT` `→ IN` `+ SUB` `↩ UNDO` `✓ DONE`, so you can build groups without pasting.
- The phone's **back** gesture also finishes editing.
- **Larger text** throughout (task titles 15 → 17), wider indentation, taller rows, and bigger tap areas for the checkbox and the ▸/▾ caret.

## 0.3.0 (build 3)

The real task list.

- Tasks show as a nested tree. Top-level tasks with subtasks become group headers with a `[done/total]` count.
- Tap any task to edit it in place.
  - **Enter** adds the next task.
  - Enter in the middle of a title splits it in two.
  - Enter on an empty task moves it out one level.
  - **Backspace** on an empty task deletes it.
  - Backspace at the start of a title joins it with the task above.
- The **quick-add bar** at the bottom adds tasks without leaving the keyboard.
- **Paste** several lines to create several tasks at once. Indentation, `-`, `*` and `[x]` are understood.
- Tap **▸ / ▾** to collapse or expand a group. Long-press it to collapse or expand all of its siblings.
- Checking tasks off arrives in the next version (the checkbox doesn't respond yet).
- Long-press the `> quest_log_` title to open the developer screen (test data, theme check).

## 0.2.0 (build 2)

Tasks are now saved on the phone. There's still no task list: use the temporary STORE panel at the top of the screen.

- Tasks are saved instantly and survive closing the app, a phone restart, and app updates.
- Undo is available.
- A daily safety copy of your tasks is kept for 3 days.
- If saved data is ever damaged, the app repairs it or restores it from the newest daily copy instead of losing everything.
- Smaller download (17 MB instead of 31 MB), and fewer permissions: only vibration.
- "LOAD SEED" fills the app with 7,500 test tasks so you can see how it holds up.

## 0.1.0 (build 1)

Foundation: no task features yet.

- The `dev` and `release` variants install side by side (`quest_log DEV` / `quest_log`).
- Release builds are signed with the release key and have no internet permission.
- Black splash screen and placeholder `<|->` icon.
- JetBrains Mono embedded. A theme check screen shows colors, type, and glyphs.
