/**
 * app/new.tsx: deep link target, questlog://new (PLAN §11.1).
 *
 * Layer: UI (Expo Router screen). The widget's `+` opens this. Like
 * task/[id].tsx it has no UI of its own: it asks for the quick-add bar to
 * take focus, then replaces itself with the list.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useActions } from '@/store/react';

export default function NewTaskLink() {
  const actions = useActions();

  useEffect(() => {
    actions.requestQuickAdd();
    router.replace('/');
  }, [actions]);

  return null;
}
