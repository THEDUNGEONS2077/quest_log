/**
 * app/task/[id].tsx: deep link target, questlog://task/<id> (PLAN §9.20).
 *
 * Layer: UI (Expo Router screen). Has no UI of its own: it asks the store
 * to reveal the task (switch tab, expand ancestors, scroll and flash), then
 * replaces itself with the list. Notification taps use the same reveal.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useActions } from '@/store/react';

export default function TaskLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const actions = useActions();

  useEffect(() => {
    if (id) actions.revealTask(id);
    router.replace('/');
  }, [id, actions]);

  return null;
}
