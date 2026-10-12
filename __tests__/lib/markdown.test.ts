/**
 * __tests__/lib/markdown.test.ts: the Markdown note for Obsidian
 * (lib/markdown.ts): structure, the Tasks plugin signifiers, nesting,
 * notes, order, and what's left out.
 */
import { atTimeOfDay, startOfDay } from '@/lib/dates';
import { MARKDOWN_FORMAT, repeatText, taskLine, toMarkdown } from '@/lib/markdown';

import { build, tk } from '../helpers/tree';

const NOW = new Date(2026, 9, 12, 15, 4).getTime();
const at = (day: number, month: number, h: number, m = 0) => atTimeOfDay(startOfDay(new Date(2026, month - 1, day).getTime()), h * 60 + m);
const SOURCE = { version: '1.7.0', build: 34 };

describe('repeatText (Tasks plugin wording)', () => {
  it.each([
    [{ freq: 'day', interval: 1, from: 'schedule' }, 'every day'],
    [{ freq: 'day', interval: 3, from: 'schedule' }, 'every 3 days'],
    [{ freq: 'week', interval: 1, from: 'schedule' }, 'every week'],
    [{ freq: 'week', interval: 1, weekdays: [5, 1, 2, 3, 4], from: 'schedule' }, 'every weekday'],
    [{ freq: 'week', interval: 2, weekdays: [5, 1], from: 'schedule' }, 'every 2 weeks on Monday, Friday'],
    [{ freq: 'month', interval: 1, monthDay: 31, from: 'schedule' }, 'every month on the 31st'],
    [{ freq: 'month', interval: 1, monthDay: 12, from: 'schedule' }, 'every month on the 12th'],
    [{ freq: 'year', interval: 1, from: 'completion' }, 'every year when done'],
  ] as const)('%j → %s', (rule, text) => {
    expect(repeatText({ ...rule, weekdays: 'weekdays' in rule ? [...rule.weekdays] : undefined })).toBe(text);
  });
});

describe('taskLine', () => {
  it('writes the title, then the due time, then the signifiers (priority, repeat, due, done)', () => {
    const s = build([
      ['q', { title: 'Call the bank', priority: 3, dueAt: at(14, 10, 9, 30), repeat: { freq: 'week', interval: 1, from: 'schedule' } }],
      ['d', { title: 'Renew passport', done: true, doneAt: at(9, 10, 12), priority: 1 }],
      ['p', { title: 'Plain' }],
    ]);
    expect(taskLine(tk(s, 'q')!)).toBe('- [ ] Call the bank 🕐 09:30 ⏫ 🔁 every week 📅 2026-10-14');
    expect(taskLine(tk(s, 'd')!)).toBe('- [x] Renew passport 🔽 ✅ 2026-10-09');
    expect(taskLine(tk(s, 'p')!)).toBe('- [ ] Plain');
  });

  it('keeps titles on one line, and names an empty one', () => {
    const s = build([['a', { title: 'two\nlines   here ' }], ['b', { title: '  ' }]]);
    expect(taskLine(tk(s, 'a')!)).toBe('- [ ] two lines here');
    expect(taskLine(tk(s, 'b')!)).toBe('- [ ] Untitled');
  });
});

describe('toMarkdown', () => {
  const tree = () =>
    build([
      ['report', { title: 'Ship the report', priority: 3, category: 'main', updatedAt: 5 }, [
        ['numbers', { title: 'pull the numbers', done: true, doneAt: at(11, 10, 10) }],
        ['write', { title: 'write it up', dueAt: at(13, 10, 16), notes: 'draft in the shared doc\nsecond line' }, [
          ['intro', { title: 'intro' }],
        ]],
        ['gone', { title: 'deleted objective', deletedAt: 1 }],
      ]],
      ['run', { title: 'Morning run', category: 'daily', repeat: { freq: 'day', interval: 1, from: 'schedule' }, dueAt: at(13, 10, 7) }],
      ['late', { title: 'Late thing', category: 'main', dueAt: at(1, 10, 9), updatedAt: 9 }],
      ['passport', { title: 'Renew passport', done: true, doneAt: at(9, 10, 12) }],
      ['tax', { title: 'File taxes', done: true, doneAt: at(10, 10, 12) }],
      ['trashed', { title: 'In the trash', deletedAt: 1 }],
    ]);

  it('starts with front matter (Obsidian properties) and an explanation', () => {
    const md = toMarkdown(tree(), NOW, SOURCE);
    const front = md.split('---\n')[1]!;
    expect(front).toBe(
      [
        `quest_log: ${MARKDOWN_FORMAT}`,
        'synced: 2026-10-12T15:04',
        'app: "quest_log 1.7.0 (build 34)"',
        'open_quests: 3',
        'completed_quests: 2',
        'overdue_quests: 1',
        'level: 0',
        'xp: 0',
        'day_streak: 0',
        'tags:',
        '  - quest_log',
        '',
      ].join('\n'),
    );
    expect(md).toContain('# quest_log\n\n> [!info] Synced from quest_log on 2026-10-12 at 15:04');
  });

  it('puts open quests under their tab in the app order, objectives nested by tabs, notes as quotes', () => {
    const md = toMarkdown(tree(), NOW, SOURCE);
    const main = md.slice(md.indexOf('## MAIN'), md.indexOf('## MISC'));
    expect(main).toBe(
      [
        '## MAIN',
        '',
        // Priority first (the list's order), so the !!! quest leads.
        '- [ ] Ship the report ⏫',
        '\t- [x] Pull The Numbers ✅ 2026-10-11',
        '\t- [ ] Write It Up 🕐 16:00 📅 2026-10-13',
        '\t\t> draft in the shared doc',
        '\t\t> second line',
        '\t\t- [ ] Intro',
        '- [ ] Late thing 🕐 09:00 📅 2026-10-01',
        '',
        '',
      ].join('\n'),
    );
    expect(md).toContain('## DAILY\n\n- [ ] Morning run 🕐 07:00 🔁 every day 📅 2026-10-13\n');
    expect(md).toContain('## MISC\n\n_Nothing open._\n');
  });

  it('ends with COMPLETED, newest first, and leaves Trash out', () => {
    const md = toMarkdown(tree(), NOW, SOURCE);
    expect(md.slice(md.indexOf('## COMPLETED'))).toBe(
      '## COMPLETED\n\n- [x] File taxes ✅ 2026-10-10\n- [x] Renew passport ✅ 2026-10-09\n',
    );
    expect(md).not.toContain('trash');
    expect(md).not.toContain('deleted objective');
  });

  it('every live task appears exactly once', () => {
    const md = toMarkdown(tree(), NOW, SOURCE);
    for (const title of ['Ship the report', 'Pull The Numbers', 'Write It Up', 'Intro', 'Morning run', 'Late thing', 'Renew passport', 'File taxes']) {
      expect(md.split(`] ${title}`).length - 1).toBe(1);
    }
  });

  it('an empty app still makes a sensible note', () => {
    const md = toMarkdown(build([]), NOW, SOURCE);
    expect(md).toContain('## DAILY\n\n_Nothing open._');
    expect(md).toContain('## COMPLETED\n\n_Nothing completed yet._\n');
  });
});
