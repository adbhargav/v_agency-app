import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The open requirement lives in `?requirement=` so the detail drawer is deep-linkable. */
export function useRequirementDrawer() {
  const [params, setParams] = useSearchParams();
  const open = useCallback(
    (id: string) =>
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('requirement', id);
        return n;
      }),
    [setParams],
  );
  const taskOpen = params.has('task');
  const close = useCallback(() => {
    // A task drawer opened on top of the requirement closes first (Escape reaches both).
    if (taskOpen) return;
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('requirement');
        return n;
      },
      { replace: true },
    );
  }, [setParams, taskOpen]);
  return { requirementId: params.get('requirement'), open, close };
}
