# Changelog

Each version gets one section. It feeds the in-app "What's new" screen and the GitHub Release notes (PLAN §15.4).

## 1.3.1 (build 25)

Quests first.

- **Every quest has a `+`** to add objectives (subtasks), from the moment you create it. While you edit a quest, the `+` is where `+ NOTE` used to be (notes are still on the toolbar's NOTE).
- **The bottom bar reads `> new quest`**, and the app icon shortcut is now **New quest**.
- **A taller XP bar**, and the top panel (title, tabs, XP bar) now has one fixed divider that stays put while you scroll your quests.

## 1.3.0 (build 24)

XP and levels.

- **Earn XP by completing tasks.** Your level is at the top: `<7>_quest_log`. It starts at 0. Level 1 takes 50 XP, and each level after needs 25 XP more than the one before.
- **What tasks are worth:** 10 XP each, +2 / +5 / +10 for `!` / `!!` / `!!!`, and +5 for finishing before the due time.
- **Quests pay more the bigger they are:** +8 XP for every subtask when the quest is completed. The `[3/5]` count is now a small meter that fills as you go and shows the reward: `3/5 · +58 XP`.
- **Streaks:**
  - **Day streak:** complete something every day for +5% XP per day in a row (up to +50%). It shows as `3-DAY STREAK` at the top.
  - **Repeat streak:** a repeating task done on time again and again earns ×1.1, ×1.2… up to ×2.0 (the multiplier shows on the task). Finishing late resets it.
- **A slim XP bar** under the tabs fills as you earn. A `+18` floats up with each gain, and the bar sweeps full on a level-up.
- **The completion message shows what you earned:** `COMPLETED · +18 XP · LEVEL 3!`. **UNDO** takes the XP back. Clearing or deleting finished tasks never does.
- **COMPLETED** shows what each task earned.
- **The header is larger** (+30%), with smaller boxes around `/ ? ⊛`.
- **iPhone:** the web version's offline mode is now sturdier.

## 1.2.2 (build 23)

- **Typing `@1p` no longer turns into `@1p1pm`.** The fix in 1.2.1 was incomplete: the app was still writing the text back into the box after every letter, which confused the keyboard's word suggestions. It no longer does.

## 1.2.1 (build 22)

Fixes for typing shorthand and changing dates.

- **Typing `@1pm` no longer turns into `@1p1pm`.** When your keyboard suggested or completed a word, the app wrote the text back into the box at the wrong moment and the suggestion was added twice. Text boxes now keep your typing as it is.
- **The due-date sheet fits the screen.** With the new AMEND buttons it had grown taller than the screen, so the top (including AMEND) was hidden and only the REPEAT button showed. It now always fits, and scrolls on small screens.

## 1.2.0 (build 21)

Changing due dates.

- **Change a date without starting over:** tap the date under a task, or hold the task and let go. **Change due date / time…** is now first in that menu. The new **AMEND** row offers:
  - **CHANGE DATE…** picks a new day and keeps the time
  - **CHANGE TIME…** picks a new time and keeps the day
  - **+1 HOUR**, **+1 DAY** and **+1 WEEK**
- **Shorthand on saved tasks now always works.** Typing `!!`, `@fri 5pm` or `// note` into an existing task used to stay as plain text if you tapped another task or the new-task bar instead of pressing Enter. It's now applied whichever way you finish editing.
- **Shorthand amends dates sensibly:** on a task due Friday 15:00, `@5pm` means Friday at 17:00 and `@mon` means Monday at 15:00.
- An empty task is no longer left behind when you tap away from it.

## 1.1.0 (build 20)

quest_log on iPhone.

- **iPhone (and any browser):** open [thedungeons2077.github.io/quest_log](https://thedungeons2077.github.io/quest_log/) in Safari, then **Share → Add to Home Screen**.
  - It runs full screen, in the same green-on-black style, and **works offline**.
  - Your tasks stay on your phone, inside the home-screen app.
  - **Backups** use the share sheet (**Save to Files**), and a backup moves your tasks between Android and iPhone.
  - **Reminders are Android-only:** iPhone web apps can't schedule them. Due dates still show and turn OVERDUE.
- **Fixes for every platform:**
  - Pressing Enter on keyboards that type a line break now saves the task. Before, the shorthand like `!!!` stayed in the title.
  - Reduce motion now reads **SYSTEM** instead of ANDROID.

## 1.0.0 (build 19)

Version 1: ready for beta testers.

- **Easier tapping:** tap anywhere in a task's title area to edit it, not just on the words.
- **Smoother sheets:** menus and the date and repeat pickers rise into place over a fading backdrop.
- **Large text:** at the biggest Android font sizes, the header shrinks its title so the buttons always fit.
- **Crash safety net:** if a screen ever fails, the app says **SOMETHING WENT WRONG**, reassures you that your tasks are safe, and offers **TRY AGAIN** and **COPY ERROR DETAILS**.
- **Report a problem** (Settings → Help) opens a pre-filled GitHub page in your browser. The app itself still never goes online.
- New install, backup and update guides for testers (`INSTALL.md`), and a README on GitHub.

## 0.12.0 (build 18)

Settings and backup.

- **Settings** (⊛ at the top right):
  - **Behavior:** reminders on by default, default time, swipe actions, auto-clear of old completed tasks.
  - **Feel:** boot screen, haptics, reduce motion.
  - **Notifications:** whether reminders are allowed, with a shortcut to Android's settings.
- **Backups:**
  - **Save backup** puts every task (Trash too) in a file, in a folder you choose. **Share backup** sends it to any app you like.
  - **Import** shows what a backup holds, then lets you **Merge** (add tasks you don't have) or **Replace** everything. **UNDO** works for both.
  - **Restore a daily snapshot:** the app keeps a copy of your tasks from each of the last 3 days.
- **Auto-clear completed** now works: when it's on, completed tasks older than 30 or 90 days move to Trash when the app starts.
- **The home screen widget has been removed.** If you added it, it disappears from your home screen.

## 0.10.0 (build 16)

Polish: the finishing touches.

- **The ▸ caret is bigger** (another 20%) with more room before the checkbox, and it **turns** smoothly to open or close a group.
- **Boot screen:** a short terminal start-up on launch. Tap to skip it. It doesn't show when animations are reduced.
- **Blinking block cursor** `█` on the empty list and in the idle new-task bar.
- **A soft green glow** around the task you're editing.
- **Empty list:** a **LOAD EXAMPLE TASKS** button adds a few tasks to try things out (UNDO removes them). Search and empty groups get their own messages.
- **Tips:** short one-time hints at the bottom while you learn the app.
- **What's new:** after each update, this page shows what changed. Open it any time from the end of the `?` guide.
- **App icon shortcut:** hold the quest_log icon and choose **New task** to open straight into typing.
- **Accessibility:**
  - TalkBack reads repeat rules on tasks and offers **Move to…** in each task's actions.
  - The COMPLETED tab's buttons are now labeled.
  - Pop-up sheets read their contents properly.
- **Reduce motion** now applies to every animation.

## 0.9.0 (build 15)

Finding, focusing and organizing.

- **All main tasks are in caps,** like group titles, whether or not they have subtasks.
- **A rewritten user guide** (`?`): plain-language sections that open with a tap, starting with **START HERE**.
- **Search** (`/` at the top right) searches titles and notes on the tab you're on. Capitals and accents don't matter. Results show the groups they're in, dimmed, and the matched text is highlighted.
- **Filters** (with search on ACTIVE): **!!!** high priority · **DUE** · **OVERDUE** · **↻** repeating.
- **Zoom into a group** (hold → Zoom into) to see only that group. The path at the top (`← ALL / WORK / …`) takes you back up, and so does the back button.
- **Select several tasks** (hold → Select, then tap more). The bar at the bottom offers **DONE · PRI · DUE · MOVE · GROUP · DEL**.
- **Move to…** (hold menu) sends a task to any group from a searchable list.
- **Sort subtasks…** (hold menu) orders a group by priority, due date or A–Z, once.
- **Trash** (on the COMPLETED tab): deleted tasks are kept for 7 days. Restore them to where they were, or delete them for good.
- **Back button** steps out of selection, then search, then zoom, before leaving the app.

## 0.8.0 (build 14)

Drag-and-drop.

- **Hold a task for a moment, then drag** to move it:
  - **Up or down** reorders it.
  - **Sideways** nests it under the task above (drag right) or moves it out a level (drag left).
  - A green line shows exactly where, and how deep, it will land.
- Subtasks always travel with their task. The lifted row shows how many (`+3`).
- **The list scrolls by itself** when you drag near the top or bottom.
- **Hovering over a closed group** for a moment opens it, so you can drop inside.
- You feel a tick when you lift a task and each time the landing spot changes. Every move can be undone (**MOVED · UNDO**).
- **Holding still without dragging** still opens the task menu.
- **TalkBack:** new **Move up** and **Move down** actions.

## 0.7.2 (build 13)

- **Subtasks are a size smaller** (15 pt), between group titles and main tasks, so the tree reads clearly.
- **The COMPLETED tab matches:** the same title sizes, group-style titles for completed groups, and details (↻, last changed) under the title.
- **Fixed: shorthand when editing a saved task.**
  - Typing only shorthand (like `!!`) into a task no longer deletes it. The title stays and the priority is set.
  - Words already in a saved title (like an escaped `@fri`) stay as text when you edit the title later. Only newly typed shorthand is applied.
  - The chips shown while typing now match exactly what gets applied.

## 0.7.1 (build 12)

- **Titles keep their full width.** A task's details (priority, notes ≡, due date and time, ↻ repeat, `[done/total]`) now sit on their own line under the title, instead of squeezing it into a broken-up wrap.
- **Group titles are 20% smaller.** They're still uppercase and bright, so they stand out without shouting.

## 0.7.0 (build 11)

Repeating tasks.

- **Make any task repeat:** use **↻ REPEAT…** in the date sheet or the long-press menu.
  - Choose daily, weekdays, weekly (pick the days), monthly, yearly, or every N days, weeks, months or years.
  - Choose whether the next date counts **from the schedule** or **after you finish**.
- **Shorthand:** `*daily` `*weekdays` `*weekly` `*monthly` `*yearly` `*mon,thu` `*every 2w`. For example: `standup *weekdays @9am`.
- **When you check off a repeating task,** the line draws through it and then it springs back with its **next date**. A message shows when the next one is due.
  - Its subtasks reset, so a repeating group works as a reusable checklist.
  - A completed copy is kept on the **COMPLETED** tab, marked **↻**.
- **Overdue repeating tasks skip ahead** to the next future date. No pile-up of missed ones.
- **Monthly on the 31st** falls on the last day of shorter months, then returns to the 31st.
- DONE and SNOOZE on a repeating task's notification work as expected. Snoozing doesn't shift future reminders.

## 0.6.2 (build 10)

- Every main (top-level) task now has a divider line above it, not only groups, so tasks are easier to tell apart at a glance.

## 0.6.1 (build 9)

From your feedback on 0.6.0:

- **What you're typing is always visible.** The list measures where your text box is and snaps it to sit just above the toolbar and keyboard: when you start typing, when the keyboard opens, and when the text wraps onto a new line. This covers new subtasks, titles and notes.
- **`+` next to every group title** adds a subtask straight away.
- **▸ / ▾ are bigger** again.
- **Accessibility.** TalkBack now offers every row action (complete, edit, add subtask, indent, outdent, priority, due date, notes, collapse, menu, delete). Rows announce their due date, overdue status, reminder and notes. Buttons say which task they act on ("Collapse WORK", "Complete Ship v2").

## 0.6.0 (build 8)

Reminders.

- **Due dates with reminders.** Use **◔ DUE** in the editing toolbar, **Due / remind…** in the long-press menu, or tap a task's due label. Pick **IN 1H**, **TONIGHT 20:00**, **TOMORROW 09:00**, **NEXT MON 09:00**, or **CUSTOM…** for any date and time.
- **NOTIFY on/off** for each task: on sends a notification at the due time, off just keeps the date.
- **Notifications have DONE and SNOOZE 15M buttons** that work even when the app is closed. The app shows what happened with an UNDO.
- **Tapping a notification** opens the app right at that task: it scrolls to it and flashes it.
- Shorthand like `@fri 5pm` now sets a real reminder too.
- quest_log asks for notification permission **only the first time** a reminder is set. If you decline, dates still work, and the date sheet explains how to turn notifications back on.
- Reminders survive a phone restart.

## 0.5.1 (build 7)

From your feedback on 0.5.0:

- **Editing stays in view.** The task you're typing in (including a new subtask) sits right above the toolbar and keyboard, and is scrolled into view if it was off-screen.
- **User guide.** Tap `?` at the top right for a quick reference to gestures, the toolbar and shorthand.
- **The keyboard closes after adding a task** from the bottom bar.
- **The ▸ / ▾ caret is 15% bigger.**

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
