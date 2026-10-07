# Changelog

Each version gets one section. It feeds the in-app "What's new" screen and the GitHub Release notes (PLAN §15.4).

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
