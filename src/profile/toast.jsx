// In-page messages instead of the browser's alert()/confirm() pop-ups.
//   toast('Saved')                                   short note bottom-right, fades after a few seconds
//   toast('Deleted', { action: { label: 'Undo', run } })   with a button
//   await ask({ title, message, buttons })           dialog; resolves the clicked button's value, or null (Esc / Cancel)
// <Toaster /> is mounted once in App and draws both.
import { useEffect, useRef, useState } from 'react'
import { ICONS, Icon } from './icons.jsx'

let showToast = () => {}
let showDialog = () => Promise.resolve(null)

export const toast = (message, opts = {}) => showToast({ message, tone: 'ok', duration: opts.action ? 8000 : 4000, ...opts })
// buttons: [{ label, value, tone: 'primary' | 'danger' | 'plain' }], first one is the default (focused).
export const ask = (opts) => showDialog(opts)
// Yes/no shortcut: resolves true / false.
export const confirmAsk = async ({ ok = 'OK', danger, ...opts }) =>
  (await ask({ ...opts, buttons: [{ label: ok, value: true, tone: danger ? 'danger' : 'primary' }, { label: 'Cancel', value: null, tone: 'plain' }] })) === true

const TOAST_TONE = { ok: 'bg-gray-900 text-white', error: 'bg-red-600 text-white' }
const BUTTON_TONE = {
  primary: 'bg-emerald-500 text-white hover:bg-emerald-600',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  plain: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
}

export function Toaster() {
  const [toasts, setToasts] = useState([])
  const [dialog, setDialog] = useState(null) // { title, message, buttons, resolve }
  const ref = useRef(null)
  const drop = (id) => setToasts((ts) => ts.filter((t) => t.id !== id))

  useEffect(() => {
    showToast = (t) => {
      const id = Math.random()
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]) // at most 3 on screen
      setTimeout(() => drop(id), t.duration)
    }
    showDialog = (opts) => new Promise((resolve) => setDialog({ buttons: [{ label: 'OK', value: true, tone: 'primary' }], ...opts, resolve }))
  }, [])
  useEffect(() => { if (dialog) ref.current?.showModal() }, [dialog])

  const close = (value) => { ref.current?.close(); dialog.resolve(value); setDialog(null) }

  return (
    <>
      {dialog && (
        <dialog ref={ref} onCancel={(e) => { e.preventDefault(); close(null) }} aria-labelledby="ask-title"
          className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-gray-200 bg-white p-5 font-lato text-gray-800 shadow-xl backdrop:bg-gray-900/40">
          <h2 id="ask-title" className="text-base font-bold text-gray-900">{dialog.title}</h2>
          {dialog.message && <p className="mt-2 whitespace-pre-line text-sm text-gray-600">{dialog.message}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {[...dialog.buttons].reverse().map((b, i, all) => (
              <button key={b.label} type="button" autoFocus={i === all.length - 1} onClick={() => close(b.value)}
                className={`h-9 rounded-full px-4 text-sm font-bold ${BUTTON_TONE[b.tone ?? 'primary']}`}>{b.label}</button>
            ))}
          </div>
        </dialog>
      )}
      <div aria-live="polite" className="print:hidden fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 font-lato sm:inset-x-auto sm:right-5 sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
            className={`flex max-w-md items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-lg ${TOAST_TONE[t.tone]}`}>
            <Icon d={t.tone === 'error' ? ICONS.close : ICONS.checkCircle} className="h-4 w-4 flex-none" />
            <span>{t.message}</span>
            {t.action && (
              <button type="button" onClick={() => { drop(t.id); t.action.run() }} className="ml-1 font-bold text-amber-300 underline underline-offset-2 hover:text-amber-200">
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
