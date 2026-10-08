/**
 * components/common/useAppFonts.web.ts: loads JetBrains Mono in the web
 * build / iPhone PWA (native version: useAppFonts.ts).
 *
 * Layer: UI. Browsers need the font files loaded at runtime. The names
 * match the native ones (theme/typography.ts `fonts`), so styles are
 * identical on every platform. The files are bundled with the app (and
 * cached by the service worker), so this works offline too. Returns true
 * once loaded, or if loading fails (the app then uses a fallback font
 * rather than never starting).
 */
import { useFonts } from 'expo-font';

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    'JetBrainsMono-Regular': require('@/assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Medium': require('@/assets/fonts/JetBrainsMono-Medium.ttf'),
    'JetBrainsMono-Bold': require('@/assets/fonts/JetBrainsMono-Bold.ttf'),
  });
  return loaded || error !== null;
}
