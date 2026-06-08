import { useEffect, useState, useCallback } from 'react'
import { loadPlus, type PlusState } from '../lib/plus'
import { useStore } from '../store'

/** Live AskAI+ economy state for the signed-in user, kept in sync via the
 * `askai-plus-changed` event that the plus lib dispatches on every write. */
export function usePlus() {
  const { user } = useStore()
  const uid = user?.uid
  const [state, setState] = useState<PlusState | null>(() => (uid ? loadPlus(uid) : null))

  const refresh = useCallback(() => {
    if (uid) setState(loadPlus(uid))
  }, [uid])

  useEffect(() => {
    refresh()
    if (!uid) return
    const onChange = () => refresh()
    window.addEventListener('askai-plus-changed', onChange)
    // Reconcile (daily reset / renewal) when the tab regains focus.
    window.addEventListener('focus', onChange)
    return () => {
      window.removeEventListener('askai-plus-changed', onChange)
      window.removeEventListener('focus', onChange)
    }
  }, [uid, refresh])

  return { uid, state, refresh }
}
