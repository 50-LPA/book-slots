// Drawing + export for the signature pad. Strokes are arrays of [x, y] points in a fixed W×H space.
export const W = 1000
export const H = 350

// Draws strokes onto ctx. scale maps W×H space to canvas pixels; (ox, oy) shifts the origin (for cropping).
export function draw(ctx, strokes, scale, ox = 0, oy = 0, lineWidth = 4) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = '#111827'
  for (const pts of strokes) {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]) // a tap leaves a dot
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]
      const [nx, ny] = pts[i + 1]
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2) // smooth: curve through midpoints
    }
    if (pts.length > 1) ctx.lineTo(...pts[pts.length - 1])
    ctx.stroke()
  }
}

const bytes = (dataUrl) => Math.ceil(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4)

// Crops to the ink, scales to at most 120px tall / 480px wide (≈ 300 dpi at the sheet's 13mm), and keeps it under maxBytes:
// PNG first (crisp), then WebP at falling quality, then smaller sizes. Returns { url, bytes, width, height }.
export function exportSignature(strokes, maxBytes = 10 * 1024) {
  const pts = strokes.flat()
  const pad = 8
  const minX = Math.min(...pts.map((p) => p[0])) - pad
  const minY = Math.min(...pts.map((p) => p[1])) - pad
  const bw = Math.max(...pts.map((p) => p[0])) + pad - minX
  const bh = Math.max(...pts.map((p) => p[1])) + pad - minY

  let best
  for (const maxH of [120, 96, 72]) {
    const s = Math.min(maxH / bh, (maxH * 4) / bw)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.ceil(bw * s))
    c.height = Math.max(1, Math.ceil(bh * s))
    draw(c.getContext('2d'), strokes, s, minX, minY, Math.max(4, 2.4 / s)) // keep lines ≥ 2.4px after shrinking
    const tries = [c.toDataURL('image/png'), ...[0.8, 0.6, 0.4].map((q) => c.toDataURL('image/webp', q))]
    for (const url of tries) {
      const size = bytes(url)
      if (!best || size < best.bytes) best = { url, bytes: size, width: c.width, height: c.height }
      if (size <= maxBytes) return { url, bytes: size, width: c.width, height: c.height }
    }
  }
  return best // smallest we could make
}
