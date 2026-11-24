const PT = 200 // Professional Tax, deducted monthly from in-hand

// Small numbers are LPA (6.5 → 6,50,000), same rule as the Money input.
const rupees = (v) => {
  const n = Number(v)
  return v === '' || isNaN(n) ? null : n < 100 ? n * 100000 : n
}
const out = (n) => (n == null || n < 0 ? '' : String(Math.round(n)))

// Apply one edited salary field and recalculate the rest.
// CTC (yearly) = VAR + FIX; in-hand (monthly) = FIX / 12 − PT.
export function applySalary(p, key, value) {
  const s = { ...p, [key]: value }
  const ctc = rupees(s.ctc)
  if (key === 'fixPay') {
    const fix = rupees(s.fixPay)
    s.varPay = ctc == null || fix == null ? s.varPay : out(ctc - fix)
  } else if (key === 'ctc' || key === 'varPay') {
    const v = rupees(s.varPay) ?? 0
    s.fixPay = ctc == null ? '' : out(ctc - v)
  }
  if (key !== 'inHand') {
    const fix = rupees(s.fixPay)
    s.inHand = fix == null ? '' : out(fix / 12 - PT)
  }
  return s
}
