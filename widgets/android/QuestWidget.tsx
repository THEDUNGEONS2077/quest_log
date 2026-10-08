/**
 * widgets/android/QuestWidget.tsx: the home screen widget's look
 * (PLAN §11.1, §12.8).
 *
 *   > quest_log          12 ACTIVE    +
 *   [ ] Call the bank          OVERDUE
 *   [ ] Ship v2 build   !!!      17:00
 *   [ ] Weekly review   ↻    FRI 16:00
 *
 * Layer: widget UI. Written with react-native-android-widget's primitives,
 * which are drawn natively (not React Native views). It renders only from
 * the snapshot (lib/widget.ts), never from the store, so it's cheap to
 * draw from the headless task. One resizable widget covers the three
 * sizes: the number of rows follows its height (3 / 4 / up to 8), and
 * narrow widgets drop the right-hand details.
 *
 * Taps:
 *   - [ ]: COMPLETE (handled by widgetTaskHandler.ts),
 *   - a title: opens the app at that task (questlog://task/<id>),
 *   - +: opens the app ready to type a new task (questlog://new),
 *   (links use the build's own scheme, questlog-dev:// in the dev build),
 *   - the empty or "not loaded yet" text: opens the app.
 */
import * as Linking from 'expo-linking';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { rowsForHeight, type WidgetSnapshot, type WidgetTask, widgetDueLabel } from '@/lib/widget';
import { colors } from '@/theme/colors';
import { glyphs } from '@/theme/glyphs';

/** Widget click action for the [ ] checkbox. */
export const COMPLETE_ACTION = 'COMPLETE';

/** Fonts bundled into the widget by the config plugin (app.config.ts). */
const FONT = 'JetBrainsMono-Regular';
const FONT_BOLD = 'JetBrainsMono-Bold';

/** Below this width (dp) rows show only the checkbox and title. */
const NARROW_DP = 220;

interface Props {
  snapshot: WidgetSnapshot | null;
  width: number;
  height: number;
  /** Current time, for due labels. */
  now: number;
}

/** The whole widget. */
export function QuestWidget({ snapshot, width, height, now }: Props) {
  const tasks = snapshot ? snapshot.tasks.slice(0, rowsForHeight(height)) : [];
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: colors.bg,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: 2,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Header active={snapshot?.active ?? null} />
      {snapshot === null ? (
        <Message text="> OPEN quest_log TO LOAD YOUR TASKS" />
      ) : tasks.length === 0 ? (
        <Message text="> ALL CLEAR. TAP + TO ADD A TASK" />
      ) : (
        tasks.map((t) => <Row key={t.id} task={t} now={now} narrow={width < NARROW_DP} />)
      )}
    </FlexWidget>
  );
}

/** `> quest_log   12 ACTIVE   +`. The + opens the app ready to type. */
function Header({ active }: { active: number | null }) {
  return (
    <FlexWidget style={{ width: 'match_parent', height: 40, flexDirection: 'row', alignItems: 'center' }}>
      <TextWidget
        text={`${glyphs.prompt.glyph} quest_log`}
        style={{ fontFamily: FONT_BOLD, fontSize: 14, color: colors.accent }}
        clickAction="OPEN_APP"
        accessibilityLabel="Open quest_log"
      />
      <FlexWidget style={{ flex: 1 }} />
      {active !== null && (
        <TextWidget
          text={`${active} ACTIVE`}
          style={{ fontFamily: FONT, fontSize: 12, color: colors.textDim, marginRight: 4 }}
          allowFontScaling={false}
        />
      )}
      <FlexWidget
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: Linking.createURL('new') }}
        accessibilityLabel="New task"
      >
        <TextWidget text={glyphs.add.glyph} style={{ fontFamily: FONT_BOLD, fontSize: 22, color: colors.accent }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** One task: [ ] completes it, the title opens it. */
function Row({ task, now, narrow }: { task: WidgetTask; now: number; narrow: boolean }) {
  const due = widgetDueLabel(task.dueAt, now);
  const marks = `${task.priority ? glyphs.priority.glyph.repeat(task.priority) : ''}${task.repeat ? ` ${glyphs.repeat.glyph}` : ''}`.trim();
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 34,
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      <FlexWidget
        style={{ height: 'match_parent', paddingRight: 8, justifyContent: 'center' }}
        clickAction={COMPLETE_ACTION}
        clickActionData={{ id: task.id, ...(task.dueAt !== null && { dueAt: task.dueAt }) }}
        accessibilityLabel={`Complete ${task.title}`}
      >
        <TextWidget text={glyphs.checkboxOff.glyph} style={{ fontFamily: FONT, fontSize: 15, color: colors.text, letterSpacing: -0.15 }} />
      </FlexWidget>
      <FlexWidget
        style={{ flex: 1, height: 'match_parent', flexDirection: 'row', alignItems: 'center' }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: Linking.createURL(`task/${encodeURIComponent(task.id)}`) }}
        accessibilityLabel={`${task.title}${task.priority ? `, priority ${task.priority}` : ''}${due.text ? `, ${due.overdue ? 'overdue' : `due ${due.text.toLowerCase()}`}` : ''}. Open in app`}
      >
        {/* The title takes the free width (text can't flex, so it sits in a flexing box). */}
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={task.title} maxLines={1} truncate="END" style={{ fontFamily: FONT, fontSize: 14, color: colors.text }} />
        </FlexWidget>
        {!narrow && marks !== '' && (
          <TextWidget
            text={marks}
            style={{ fontFamily: FONT_BOLD, fontSize: 12, color: colors.accent, marginLeft: 6 }}
            allowFontScaling={false}
          />
        )}
        {(due.overdue || (!narrow && due.text !== '')) && (
          <TextWidget
            text={due.text}
            style={{ fontFamily: FONT, fontSize: 12, color: due.overdue ? colors.accent : colors.textDim, marginLeft: 6 }}
            allowFontScaling={false}
          />
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/** A one-line message that opens the app. */
function Message({ text }: { text: string }) {
  return (
    <FlexWidget
      style={{ width: 'match_parent', flex: 1, paddingTop: 8 }}
      clickAction="OPEN_APP"
      accessibilityLabel={`${text.slice(2)}. Open quest_log`}
    >
      <TextWidget text={text} style={{ fontFamily: FONT, fontSize: 13, color: colors.textDim }} />
    </FlexWidget>
  );
}
