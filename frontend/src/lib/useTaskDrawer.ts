import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The open task is kept in the `?task=` query param so drawers are linkable and survive refresh. */
export function useTaskDrawer() {
  const [params, setParams] = useSearchParams();
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('task', id);
        return n;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('task');
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { taskId: params.get('task'), open, close };
}
