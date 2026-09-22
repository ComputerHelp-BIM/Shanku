import { useEffect, useMemo, useState } from 'react';
import { History } from '@shanku/engine';

/** The document's transaction history, with React state for the undo/redo buttons. */
export function useHistory() {
  const history = useMemo(() => new History({ limit: 200 }), []);
  const [, bump] = useState(0);
  useEffect(() => history.subscribe(() => bump((n) => n + 1)), [history]);
  return history;
}
