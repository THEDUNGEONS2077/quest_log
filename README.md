# quest_log

```
> quest_log
> MOUNTING /quests ......... OK
> READY█
```

A terminal-style to-do app for Android. It's fast, it's fully offline, and it's built around nested tasks: groups, subtasks, due dates, reminders and repeating tasks, all in green-on-black.

- **Offline, private:** no account, no internet permission, no analytics. Your tasks never leave your phone unless you save a backup yourself.
- **Outliner editing:** tap to edit, nest with OUT and IN, drag to reorder, and type shorthand (`!!!` for priority, `@fri 9am` for a due date, `*weekly` to repeat).
- **Reminders** with DONE and SNOOZE buttons right in the notification.
- **Accessible:** every gesture has a TalkBack action, text follows the system size, and Reduce Motion is respected.

## Install (beta)

Download the latest APK from **[Releases](https://github.com/THEDUNGEONS2077/quest_log/releases/latest)** on your phone, then follow **[INSTALL.md](INSTALL.md)**. It covers first install, updating without losing tasks, and checking that the APK is genuine.

Found a problem? In the app, open **⊛ Settings → Report a problem**, or [open an issue](https://github.com/THEDUNGEONS2077/quest_log/issues/new).

## For developers

| Doc | What's in it |
|---|---|
| [PLAN.md](PLAN.md) | Product spec and build phases, with every change annotated |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, data model, data flows, rules for adding a feature |
| [RELEASING.md](RELEASING.md) | Signing key, the release script, end-to-end tests |
| [PERF.md](PERF.md) | Performance and size budgets, with measurements per release |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version (also shown in the app) |

Built with Expo (React Native), TypeScript, Zustand and MMKV, entirely on a local machine (no cloud build services). `npm run check` runs the type checks, lint and the unit tests.

© THEDUNGEONS2077. All rights reserved.
