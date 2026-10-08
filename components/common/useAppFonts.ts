/**
 * components/common/useAppFonts.ts: is the app's font ready? Native version
 * (the web version is useAppFonts.web.ts).
 *
 * Layer: UI. On Android, JetBrains Mono is embedded at build time by the
 * expo-font config plugin, so it's always ready.
 */
export function useAppFonts(): boolean {
  return true;
}
