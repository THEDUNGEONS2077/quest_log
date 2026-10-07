/**
 * app/index.tsx: the main screen: header, ACTIVE task tree, quick-add bar
 * (PLAN §9.1, §12.1).
 *
 * Layer: UI (Expo Router screen). Composition only; all behavior lives in
 * the components and the store. The ACTIVE/COMPLETED tabs arrive in Phase 5.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '@/components/common/Header';
import { QuickAddBar } from '@/components/edit/QuickAddBar';
import { TaskList } from '@/components/list/TaskList';
import { colors, size, space } from '@/theme';

export default function ListScreen() {
  const insets = useSafeAreaInsets();
  // The list leaves room at the bottom for the quick-add bar, which floats over it.
  const [barHeight, setBarHeight] = useState<number>(size.hitTarget + space.lg);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <Header />
        <TaskList bottomInset={barHeight + space.lg} />
      </View>
      <QuickAddBar onHeight={setBarHeight} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // Caps the width on large screens and split-screen (PLAN §9.20).
  content: { flex: 1, width: '100%', maxWidth: size.maxContentWidth, alignSelf: 'center' },
});
