/**
 * theme/platform.ts: the only place in the UI layer allowed to branch on
 * Platform.OS (PLAN §0). Services may also branch, inside /services.
 *
 * Layer: theme. Components import the resolved values below instead of
 * checking the platform themselves, which keeps iOS differences in one
 * file for the iOS port (see IOS_PORT.md).
 */
import { Platform, type ViewStyle } from 'react-native';

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

/**
 * A gradient background (theme/effects.ts) as a style: React Native's
 * `experimental_backgroundImage` on the phone, CSS `background-image` in
 * the web build (react-native-web passes CSS through). `size` and `repeat`
 * tile it (the scanlines). Branches here, the one place allowed to.
 */
export function backgroundStyle(image: string, size?: string, repeat?: string): ViewStyle {
  if (Platform.OS === 'web') {
    // react-native-web's types don't list these CSS properties; they're passed through as written.
    return { backgroundImage: image, ...(size && { backgroundSize: size }), ...(repeat && { backgroundRepeat: repeat }) } as unknown as ViewStyle;
  }
  return {
    experimental_backgroundImage: image,
    ...(size && { experimental_backgroundSize: size }),
    ...(repeat && { experimental_backgroundRepeat: repeat }),
  } as ViewStyle;
}
