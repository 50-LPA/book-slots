import { useEffect, useRef, useState } from 'react'
import { ICONS, Icon } from './icons.jsx'
import { H, W, draw, exportSignature } from './signature.js'

// Modal drawing pad. onSave(pngDataUrl) when the candidate is done; works with mouse, touchpad, touch and stylus.
export default function SignaturePad({ onSave, onClose }) {
  const canvas = useRef(null)
  const box = useRef(null)
  const strokes = useRef([])
  const [count, setCount] = useState(0) // re-render when strokes change
  const [full, setFull] = useState(false)
  const [rot, setRot] = useState(false) // phone: pad turned 90° to fill the screen sideways

  // Match the canvas pixels to its on-screen size (sharp on retina), redraw on resize / full screen.
  useEffect(() => {
    const c = canvas.current
    const fit = () => {
      const scale = (c.clientWidth / W) * (window.devicePixelRatio || 1)
      c.width = W * scale
      c.height = H * scale
      draw(c.getContext('2d'), strokes.current, scale)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  // Esc closes (or leaves full screen first); browser full screen exit via Esc keeps our state in sync.
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && !document.fullscreenElement && (rot ? setRot(false) : full ? setFull(false) : onClose())
    const fs = () => !document.fullscreenElement && setFull(false)
    document.addEventListener('keydown', key)
    document.addEventListener('fullscreenchange', fs)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs) }
  }, [full, rot, onClose])
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) }, [])

  const toggleFull = () => {
    const next = !full
    setFull(next)
    // Real browser full screen where supported (not on iPhone); the CSS takeover below works everywhere.
    if (next) box.current.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }

  // Browser full screen forces transform: none, so leave it before rotating.
  const toggleRot = () => {
    if (!rot && document.fullscreenElement) document.exitFullscreen().catch(() => {})
    setRot(!rot)
  }

  // Rotated 90° clockwise: the canvas's x runs down the screen, its y runs right-to-left.
  const point = (e) => {
    const r = canvas.current.getBoundingClientRect()
    return rot
      ? [((e.clientY - r.top) / r.height) * W, ((r.right - e.clientX) / r.width) * H]
      : [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  const redraw = () => {
    const c = canvas.current
    draw(c.getContext('2d'), strokes.current, c.width / W)
  }
  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    strokes.current.push([point(e)])
    redraw()
  }
  const move = (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    strokes.current[strokes.current.length - 1].push(point(e))
    redraw()
  }
  const up = () => setCount(strokes.current.length)

  const undo = () => { strokes.current.pop(); redraw(); setCount(strokes.current.length) }
  const clear = () => { strokes.current = []; redraw(); setCount(0) }
  const save = () => onSave(exportSignature(strokes.current).url) // cropped to the ink, under 10 KB

  const btn = 'flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold disabled:opacity-40'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-lato" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Candidate signature"
        className={`flex flex-col bg-white shadow-2xl ${rot ? 'fixed left-0 top-0 p-3' : full ? 'fixed inset-0 p-4 sm:p-6' : 'w-full max-w-3xl rounded-2xl p-5'}`}
        style={rot ? { width: '100dvh', height: '100dvw', transformOrigin: 'top left', transform: 'rotate(90deg) translateY(-100%)' } : undefined}>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-brand-600">Candidate Signature</h2>
          <button type="button" onClick={toggleRot} className={`${btn} ml-auto border border-gray-200 text-gray-700 hover:bg-gray-50 sm:hidden`}>
            <Icon d={ICONS.refresh} className="h-4 w-4" /> {rot ? 'Unrotate' : 'Rotate'}
          </button>
          {!rot && (
            <button type="button" onClick={toggleFull} className={`${btn} border border-gray-200 text-gray-700 hover:bg-gray-50 max-sm:hidden sm:ml-auto`}>
              <Icon d={full ? ICONS.collapse : ICONS.expand} className="h-4 w-4" /> {full ? 'Exit full screen' : 'Full screen'}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
            <Icon d={ICONS.close} className="h-5 w-5" />
          </button>
        </div>

        <div className={`mt-3 flex items-center justify-center ${full || rot ? 'min-h-0 flex-1' : ''}`}>
          <div className="relative w-full" style={full || rot ? { maxWidth: `calc((${rot ? '100dvw - 130px' : '100vh - 170px'}) * ${W / H})` } : undefined}>
            <canvas
              ref={canvas}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              aria-label="Draw your signature here"
              className="block w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-gray-300 bg-gray-50"
              style={{ aspectRatio: `${W} / ${H}` }}
            />
            {/* signing line */}
            <div className="pointer-events-none absolute inset-x-[6%] bottom-[22%] border-b border-gray-300" />
            {count === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                Sign here with your finger, stylus, mouse or touchpad
              </p>
            )}
          </div>
        </div>

        <div className={rot ? 'mt-2 flex items-center gap-3' : ''}>
        <div className={`flex items-center gap-2 ${rot ? 'flex-1' : 'mt-3 flex-wrap'}`}>
          <button type="button" onClick={undo} disabled={!count} className={`${btn} border border-gray-200 text-gray-700 hover:bg-gray-50`}>Undo</button>
          <button type="button" onClick={clear} disabled={!count} className={`${btn} border border-red-300 text-red-600 hover:bg-red-50`}>Clear</button>
          <button type="button" onClick={onClose} className={`${btn} ml-auto text-gray-600 hover:bg-gray-100`}>Cancel</button>
          <button type="button" onClick={save} disabled={!count}
            title={count ? undefined : 'Draw a signature first'}
            className={`${btn} bg-emerald-500 text-white enabled:hover:bg-emerald-600`}>
            <Icon d={ICONS.save} className="h-4 w-4" /> Save signature
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
