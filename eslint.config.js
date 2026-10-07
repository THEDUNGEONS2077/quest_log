/**
 * eslint.config.js: lint rules (flat config).
 *
 * Starts from Expo's recommended config and adds the project rules from
 * PLAN §0: no `any` (use an eslint-disable comment with a reason at library
 * boundaries), and no unused code.
 */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['android/*', 'ios/*', 'dist/*', '.expo/*'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);
