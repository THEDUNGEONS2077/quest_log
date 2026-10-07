/**
 * jest.setup.ts: global test setup, run before every test file.
 *
 * Reanimated and Worklets are native modules. Under Jest they're replaced
 * by their official mocks so that pure modules which import Reanimated
 * (for example theme/motion.ts for `Easing`) can load in Node.
 */
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must run after the mock above is registered
require('react-native-reanimated').setUpTests();
