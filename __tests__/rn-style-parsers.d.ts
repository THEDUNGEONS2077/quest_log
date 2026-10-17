/**
 * __tests__/rn-style-parsers.d.ts: types for React Native's own background
 * style parsers, which theme.test.ts runs every phosphor effect through
 * (theme/effects.ts). They ship as untyped internal modules.
 */
declare module 'react-native/Libraries/StyleSheet/processBackgroundImage' {
  /** The parsed gradients, or an empty array (nothing drawn) when the CSS is rejected. */
  export default function processBackgroundImage(value: string): readonly unknown[];
}
declare module 'react-native/Libraries/StyleSheet/processBackgroundRepeat' {
  export default function processBackgroundRepeat(value: string): readonly unknown[] | null;
}
declare module 'react-native/Libraries/StyleSheet/processBackgroundSize' {
  export default function processBackgroundSize(value: string): readonly unknown[] | null;
}
