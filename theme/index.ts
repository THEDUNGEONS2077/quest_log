/**
 * theme/index.ts: single import point for design tokens.
 *
 * Usage: `import { colors, type, space } from '@/theme';`
 * Rule (PLAN §0): no magic numbers or hex values in components; everything
 * comes through here.
 */
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './motion';
export * from './glyphs';
export * from './platform';
