import { useLayoutEffect, useRef } from 'react'
import './resume.css'
import { SIDEBAR_TEMPLATES, SIDE_SECTIONS, esc, headerHTML, normalize, sections } from './resume.js'

const overflows = (page) => page.scrollHeight > page.clientHeight + 1

// Flows the resume into A4 pages inside `root`, block by block; a block that overflows moves to the next page.
// DOM-measured, so it runs after render. Returns the page count.
export function paginate(root, d) {
  const pages = []
  root.innerHTML = ''
  const newPage = () => {
    const p = document.createElement('div')
    p.className = `rb-page tpl-${d.template}${pages.length ? ' cont' : ''}`
    p.style.setProperty('--accent', d.accent)
    if (d.font) p.style.fontFamily = `'${d.font}', sans-serif`
    p.innerHTML = (pages.length ? '' : headerHTML(d)) + '<main></main><aside></aside>'
    root.append(p)
    pages.push(p)
  }
  newPage()
  const secs = sections(d)
  const streams = SIDEBAR_TEMPLATES.includes(d.template)
    ? [['aside', secs.filter((s) => SIDE_SECTIONS.includes(s.id))], ['main', secs.filter((s) => !SIDE_SECTIONS.includes(s.id))]]
    : [['main', secs]]
  for (const [col, stream] of streams) {
    let pi = 0
    for (const s of stream) s.blocks.forEach((html, bi) => {
      const place = () => {
        const c = pages[pi].querySelector(col)
        let sec = c.lastElementChild
        if (sec?.dataset.id !== s.id) {
          sec = document.createElement('section')
          sec.className = 's-' + s.id
          sec.dataset.id = s.id
          if (bi) sec.classList.add('contd') // continued from the previous page: no heading
          sec.innerHTML = `<h2>${bi ? '' : esc(s.title)}</h2><div></div>`
          c.append(sec)
        }
        const b = document.createElement('div')
        b.innerHTML = html
        sec.lastElementChild.append(b)
        return { sec, b }
      }
      const before = pages[pi].querySelector(col).children.length
      const { sec, b } = place()
      // Move on only if something else is already on this page (a block taller than a page stays, clipped).
      if (overflows(pages[pi]) && before) {
        b.remove()
        if (!sec.lastElementChild.children.length) sec.remove()
        if (!pages[++pi]) newPage()
        place()
      }
    })
  }
  return pages.length
}

// Read-only resume (candidate's own view): every page stacked, scaled down to the screen width; Print gives A4 pages.
export default function ResumeView({ resume }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const root = ref.current
    const fit = () => {
      const box = root.parentElement.clientWidth, s = Math.min(1, box / root.offsetWidth)
      root.style.transform = `scale(${s})`
      root.style.marginLeft = `${Math.max(0, (box - root.offsetWidth * s) / 2)}px` // centred in the card
    }
    const draw = () => { paginate(root, normalize(resume)); fit(); root.parentElement.style.height = root.getBoundingClientRect().height + 'px' }
    draw()
    document.fonts?.ready.then(draw) // page breaks depend on the web fonts
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [resume])
  return <div className="overflow-hidden print:!h-auto"><div ref={ref} className="rb-pages print:!ml-0 print:!transform-none" /></div>
}
