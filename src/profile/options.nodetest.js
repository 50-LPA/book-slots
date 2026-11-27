// Run: npm run test:profile
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, startPassOut, titleCase } from './options.js'

test('advance status from amount paid', () => {
  assert.deepEqual(advance({ advanceAmount: '' }), { paid: 0, due: 20000, status: 'unpaid' })
  assert.deepEqual(advance({ advanceAmount: '5000' }), { paid: 5000, due: 15000, status: 'partial' })
  assert.deepEqual(advance({ advanceAmount: '20000' }), { paid: 20000, due: 0, status: 'paid' })
  assert.equal(advance({ advanceAmount: '25000' }).status, 'paid')
  assert.equal(advance({}).status, 'unpaid')
})

test('names in title case', () => {
  assert.equal(titleCase('  rohan   DESHMUKH '), 'Rohan Deshmukh')
  assert.equal(titleCase("anne-marie o'neil"), "Anne-Marie O'Neil")
  assert.equal(titleCase('r.k. sharma'), 'R.K. Sharma')
  assert.equal(titleCase(undefined), '')
})

test('startPassOut: marked pass-out wins, else latest complete', () => {
  const list = [{ type: 'graduation', date: '2022-05' }, { type: 'postgraduation', date: '2024-02' }]
  assert.equal(startPassOut(list), '2024-02')
  assert.equal(startPassOut([{ ...list[0], start: true }, list[1]]), '2022-05')
  assert.equal(startPassOut([{ type: 'hsc', date: '2020-', start: true }, list[1]]), '2024-02')
})
