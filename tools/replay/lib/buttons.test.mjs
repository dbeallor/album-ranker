import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { loadFixtures } from './fixtures.mjs'
import { stateAt } from './state-at.mjs'
import { buttonSelector, commandFor, locate, tabSelector } from './buttons.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline/2026-11-21.json'), 'utf8'))
const fixtures = await loadFixtures(path.join(ROOT, 'fixtures/2026-11-21'))
const at = (iso) => stateAt(Date.parse(`2026-11-21T${iso}Z`), timeline, fixtures)

test('chief-thread commands and selectors name one ticket exactly, so ALBUM-1 never matches ALBUM-10', () => {
  assert.equal(commandFor('approve', 'ALBUM-2'), 'approve 2')
  assert.equal(commandFor('changes', 'ALBUM-2'), 'changes 2: ')
  assert.equal(commandFor('todo', 'ALBUM-3'), 'mark 3 todo')
  assert.equal(buttonSelector('approve', 'ALBUM-2'), 'a.approve[data-return="approve 2"]')
  assert.equal(buttonSelector('changes', 'ALBUM-19'), 'li.ticket:has(.seg[data-ticket="ALBUM-19"]) a.approve:not([data-return])')
  assert.equal(buttonSelector('spec', 'ALBUM-19'), 'li.ticket:has(.seg[data-ticket="ALBUM-19"]) a.action:text-is("View spec")')
  assert.equal(buttonSelector('pr', 'ALBUM-19'), 'li.ticket:has(.seg[data-ticket="ALBUM-19"]) a.action:text-is("View PR")')
  assert.equal(buttonSelector('todo', 'ALBUM-9'), 'a.todo[data-return="mark 9 todo"]')
  assert.equal(buttonSelector('agents', 'ALBUM-2', 'merged'), 'button.seg[data-merged="ALBUM-2"][data-view="agents"]')
  assert.equal(buttonSelector('details', 'ALBUM-20'), 'button.seg[data-ticket="ALBUM-20"][data-view="details"]')
  assert.equal(tabSelector('backlog'), 'button[data-tab="backlog"]')
})

test('a spec waiting for approval has View spec, Approve and Changes on the Ship loop tab', () => {
  assert.deepEqual(locate(at('05:21:20'), 'ALBUM-4'), { tab: 'ship', group: 'Awaiting build approval', label: 'Spec ready to build', scope: 'ticket', controls: ['agents', 'details', 'spec', 'approve', 'changes'] })
  assert.deepEqual(locate(at('05:21:20'), 'ALBUM-5').controls, ['agents', 'details', 'spec', 'approve', 'changes'])
})

test('a PR waiting for approval has View PR, Approve and Changes', () => {
  const found = locate(at('05:39:20'), 'ALBUM-4')
  assert.equal(found.label, 'Ready to merge')
  assert.deepEqual(found.controls, ['agents', 'details', 'pr', 'approve', 'changes'])
})

test('a building, queued or speccing ticket has only Agents and Details', () => {
  for (const [time, id, group] of [['05:49:40', 'ALBUM-20', 'Speccing'], ['05:49:40', 'ALBUM-7', 'Building'], ['05:52:00', 'ALBUM-19', 'Queued to build']]) {
    const found = locate(at(time), id)
    assert.equal(found.group, group)
    assert.deepEqual(found.controls, ['agents', 'details'])
  }
})

test('a Backlog card has Start shipping; a Todo card on the Ship loop tab has none', () => {
  const backlog = locate(at('05:17:28'), 'ALBUM-4')
  assert.deepEqual([backlog.tab, backlog.group], ['backlog', 'Backlog'])
  assert.ok(backlog.controls.includes('todo'))
  const todo = locate(at('05:42:10'), 'ALBUM-14')
  assert.deepEqual([todo.tab, todo.group], ['ship', 'Waiting to spec'])
  assert.deepEqual(todo.controls, ['details'])
  assert.equal(locate(at('05:57:10'), 'ALBUM-9').tab, 'ship')
})

test('a ticket held back to the Backlog has no Changes or Approve button', () => {
  const held = locate(at('05:52:34'), 'ALBUM-14')
  assert.deepEqual([held.tab, held.group], ['backlog', 'Backlog'])
  assert.equal(held.controls.includes('changes'), false)
  assert.equal(held.controls.includes('approve'), false)
})

test('a running ticket helper is on the Backlog tab with Agents but no Details', () => {
  const found = locate(at('05:46:40'), 'helper:3dd700b3-c153-4269-8d42-d93342d2d54b')
  assert.deepEqual([found.tab, found.group, found.controls], ['backlog', 'Writing tickets', ['agents']])
})

test('a merged ticket is on the Done tab, scoped by data-merged', () => {
  assert.deepEqual(locate(at('05:56:00'), 'ALBUM-7'), { tab: 'done', group: 'Merged', label: 'Done', scope: 'merged', controls: ['agents', 'details'] })
  assert.equal(locate(at('05:56:00'), 'ALBUM-99'), null)
})
