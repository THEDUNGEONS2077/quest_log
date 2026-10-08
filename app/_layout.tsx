/**
 * app/_layout.tsx: root layout, which wraps every screen.
 *
 * Layer: UI (Expo Router). Sets up the app shell:
 *   - the store: importing '@/store' hydrates it synchronously from MMKV,
 *     so the first render already has the user's tasks (ARCHITECTURE.md §4.4),
 *   - the gesture handler root (required by react-native-gesture-handler),
 *   - the keyboard controller (quick-add bar and editor stay above the keyboard),
 *   - safe-area insets,
 *   - the light status bar on a black background,
 *   - a header-less Stack, since each screen draws its own terminal header,
 *   - reminders: queued notification actions are drained and the OS
 *     schedule reconciled at start, on foreground and after changes
 *     (services/reminderLifecycle.ts). The notification background task is
 *     defined by importing services/notificationTask first, at load time.
 *   - motion: the Reduce Motion setting, applied to every animation,
 *   - the boot screen, laid over the app on a cold start (BootGate),
 *   - the app icon's "New task" shortcut (services/quickActions.ts),
 *   - the crash screen (the exported ErrorBoundary, CrashScreen.tsx).
 *
 * Fonts need no loading step here: they're embedded at build time by the
 * expo-font config plugin (app.config.ts).
 */
// Must load before anything else: defines the background task that handles
// DONE/SNOOZE taps when Android starts JS without any UI.
import '@/services/notificationTask';

import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootGate } from '@/components/common/BootSequence';
import { KeyboardProvider } from '@/components/common/keyboard';
import { MotionConfig } from '@/components/common/motion';
import { useAppFonts } from '@/components/common/useAppFonts';
import { setHapticsEnabled } from '@/services/haptics';
import { startQuickActions } from '@/services/quickActions';
import { startReminders } from '@/services/reminderLifecycle';
import { appBundle, kv } from '@/store';
import { StoreProvider } from '@/store/react';
import { colors } from '@/theme';

/**
 * Crash safety net: Expo Router shows this instead of the app when a screen
 * throws while rendering (components/common/CrashScreen.tsx).
 */
export { CrashScreen as ErrorBoundary } from '@/components/common/CrashScreen';

export default function RootLayout() {
  // Keep the haptics service in step with the "Haptics" setting.
  useEffect(() => {
    const { store } = appBundle;
    setHapticsEnabled(store.getState().settings.haptics);
    return store.subscribe((s) => s.settings.haptics, setHapticsEnabled);
  }, []);

  // Reminders: drain queued notification actions, reconcile the schedule, and
  // open a task when its notification is tapped.
  useEffect(
    () =>
      startReminders(appBundle.store, kv, (taskId) => {
        appBundle.store.getState().revealTask(taskId);
        router.navigate('/');
      }),
    [],
  );

  // App icon shortcut "New task": open the ACTIVE list ready to type.
  useEffect(
    () =>
      startQuickActions(() => {
        // Back to the main screen if another one is open (at a cold start it already is).
        if (router.canDismiss()) router.dismissAll();
        appBundle.store.getState().requestQuickAdd();
      }),
    [],
  );

  // Web only: wait for the font (useAppFonts.web.ts). Native has it built in, so this is instant.
  const fontsReady = useAppFonts();
  if (!fontsReady) return <View style={styles.root} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StoreProvider value={appBundle}>
        <KeyboardProvider>
          <SafeAreaProvider>
            {/* Light icons on black. The app draws edge-to-edge, so the Android
                navigation bar shows the black root background beneath it. */}
            <StatusBar style="light" />
            <MotionConfig />
            <BootGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: styles.root,
                  // A black background during transitions prevents white flashes.
                  animation: 'fade',
                }}
              />
            </BootGate>
          </SafeAreaProvider>
        </KeyboardProvider>
      </StoreProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
