// Font Awesome icons (loaded in public/index.html), same set as the rest of book-slots.
// The size comes from the h-* class callers pass (h-4 → 1rem box), so existing call sites keep their sizes.
const boxSize = (c) => {
  const m = c.match(/\bh-\[([^\]]+)\]|\bh-([\d.]+)(?=\s|$)/)
  return m ? m[1] ?? `${m[2] / 4}rem` : '1.25rem'
}
export const Icon = ({ d, className = 'h-5 w-5' }) => (
  <i className={`fa-solid ${d} inline-flex flex-none items-center justify-center leading-none ${className}`}
    style={{ fontSize: `calc(${boxSize(className)} * 0.85)` }} aria-hidden="true" />
)
export const ICONS = {
  eye: 'fa-eye',
  arrow: 'fa-arrow-right',
  pencil: 'fa-pen',
  trash: 'fa-trash',
  search: 'fa-magnifying-glass',
  plus: 'fa-plus',
  calendar: 'fa-calendar-day',
  expand: 'fa-expand',
  collapse: 'fa-compress',
  close: 'fa-xmark',
  signature: 'fa-signature',
  checkCircle: 'fa-circle-check',
  check: 'fa-check',
  clock: 'fa-clock',
  xCircle: 'fa-circle-xmark',
  back: 'fa-arrow-left',
  document: 'fa-file-lines', // resume
  profile: 'fa-id-card',
  mobile: 'fa-mobile-screen',
  refresh: 'fa-rotate-right',
  save: 'fa-floppy-disk',
  download: 'fa-file-arrow-down',
}
