/**
 * __tests__/components/CrashScreen.test.tsx: the crash safety net
 * (components/common/CrashScreen.tsx): reassures, retries, copies details.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { CrashScreen, errorReport } from '@/components/common/CrashScreen';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

describe('CrashScreen', () => {
  const error = Object.assign(new Error('boom'), { stack: 'Error: boom\n    at Row' });

  it('says the tasks are safe and shows the error', async () => {
    await render(<CrashScreen error={error} retry={jest.fn(() => Promise.resolve())} />);
    expect(screen.getByText(/Your tasks are safe/)).toBeTruthy();
    expect(screen.getByText('Error: boom')).toBeTruthy();
  });

  it('TRY AGAIN retries, and COPY puts a full report on the clipboard', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<CrashScreen error={error} retry={retry} />);
    await fireEvent.press(screen.getByLabelText('try again'));
    expect(retry).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('copy error details'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(errorReport(error));
    expect(errorReport(error)).toMatch(/quest_log v.*\(build .*\)\n.*\nError: boom\nError: boom\n {4}at Row/);
  });
});
