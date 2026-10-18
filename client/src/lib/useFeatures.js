import { useCachedQuery } from '../api/useCachedQuery.js';
import { useAuth } from '../auth/AuthContext.jsx';

/** Which optional features the server has switched on. Everything is off until the server says otherwise. */
export function useFeatures() {
  const { isAuthed } = useAuth();
  const { data, loading } = useCachedQuery('/features', { enabled: Boolean(isAuthed) });
  return { aiTriage: Boolean(data?.features?.aiTriage), hintChat: Boolean(data?.features?.hintChat), loading };
}
