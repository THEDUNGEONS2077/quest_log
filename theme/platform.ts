/**
 * theme/platform.ts: the only place in the UI layer allowed to branch on
 * Platform.OS (PLAN §0). Services may also branch, inside /services.
 *
 * Layer: theme. Components import the resolved values below instead of
 * checking the platform themselves, which keeps iOS differences in one
 * file for the iOS port (see IOS_PORT.md).
 */
import { Platform } from 'react-native';

export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';

/**
 * Platform-specific visual tweaks.
 * - `includeFontPadding: false` removes Android's extra top/bottom padding on
 *   Text, so monospace rows line up exactly with the 4 pt grid. iOS ignores it.
 */
export const platformText = {
  includeFontPadding: false,
} as const;
