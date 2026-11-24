// Run: npm run test:profile
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applySalary } from './salary.js'

const blank = { ctc: '', varPay: '', fixPay: '', inHand: '' }

test('CTC alone → all fixed, in-hand = CTC/12 − 200', () => {
  const s = applySalary(blank, 'ctc', '600000')
  assert.deepEqual(s, { ctc: '600000', varPay: '', fixPay: '600000', inHand: '49800' })
})

test('VAR entered → FIX = CTC − VAR', () => {
  const s = applySalary(applySalary(blank, 'ctc', '600000'), 'varPay', '60000')
  assert.equal(s.fixPay, '540000')
  assert.equal(s.inHand, '44800')
})

test('FIX entered → VAR = CTC − FIX', () => {
  const s = applySalary(applySalary(blank, 'ctc', '600000'), 'fixPay', '500000')
  assert.equal(s.varPay, '100000')
  assert.equal(s.inHand, '41467')
})

test('LPA values work mid-typing', () => {
  const s = applySalary(applySalary(blank, 'ctc', '6.5'), 'varPay', '0.5')
  assert.equal(s.fixPay, '600000')
})

test('VAR above CTC → FIX left blank, not negative', () => {
  const s = applySalary(applySalary(blank, 'ctc', '500000'), 'varPay', '600000')
  assert.equal(s.fixPay, '')
  assert.equal(s.inHand, '')
})
