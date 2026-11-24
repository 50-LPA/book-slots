// One "unsaved changes" guard for the whole app. A form reports whether it has unsaved edits (useUnsaved);
// any page change (tab, breadcrumb, link, Back) then asks first, and closing/reloading the tab gets the browser's warning.
import { useEffect } from 'react'
import { confirmAsk } from './toast.jsx'

let dirty = false
let free = false // the next page change goes through without asking (e.g. right after saving or deleting)

export function useUnsaved(isDirty) {
  useEffect(() => {
    dirty = isDirty
    return () => { dirty = false }
  }, [isDirty])
}
export const leaveFreely = () => { free = true }

// Resolves true when the page may change.
export async function mayLeave() {
  if (free || !dirty) return true
  return confirmAsk({ title: 'Leave without saving?', message: 'Your changes on this page will be lost.', ok: 'Leave', danger: true })
}
export const navigated = () => { free = false; dirty = false }

window.addEventListener('beforeunload', (e) => { if (dirty && !free) e.preventDefault() })
