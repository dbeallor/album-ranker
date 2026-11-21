// Selectors and chief-thread text for the dashboard's ticket controls (page/app.js: ticket(), approveControls(), todoControl()), and where a ticket's card is at an instant.
import os from 'os'
import path from 'path'

const page = await import(path.join(os.homedir(), '.collective-wisdom/scripts/dashboard/page/app.js'))

const number = (ticket) => ticket.split('-').pop()
const card = (ticket) => `li.ticket:has(.seg[data-ticket="${ticket}"])`

const COMMANDS = {
  approve: (n) => `approve ${n}`,
  changes: (n) => `changes ${n}: `,
  todo: (n) => `mark ${n} todo`,
}

/** What lands in the Chief of Staff thread's message box when `kind` (`approve`, `changes` or `todo`) is clicked for `ticket`. */
export const commandFor = (kind, ticket) => COMMANDS[kind](number(ticket))

const SELECTORS = {
  approve: (t) => `a.approve[data-return="${commandFor('approve', t)}"]`,
  changes: (t) => `${card(t)} a.approve:not([data-return])`,
  todo: (t) => `a.todo[data-return="${commandFor('todo', t)}"]`,
  spec: (t) => `${card(t)} a.action:text-is("View spec")`,
  pr: (t) => `${card(t)} a.action:text-is("View PR")`,
  agents: (t, scope) => `button.seg[data-${scope}="${t}"][data-view="agents"]`,
  details: (t, scope) => `button.seg[data-${scope}="${t}"][data-view="details"]`,
}

/**
 * The selector (inside the dashboard iframe) of one control: `approve` (Approve), `changes` (Changes), `todo` (Start shipping), `spec` (View spec), `pr` (View PR), `agents`, `details`.
 * `scope` is `ticket` for the Ship loop and Backlog tabs, `merged` for the Done tab; it matters for `agents` and `details` only.
 * A card with no agent tasks still has a disabled `agents` button; `locate` lists it only when it can be clicked.
 */
export const buttonSelector = (kind, ticket, scope = 'ticket') => SELECTORS[kind](ticket, scope)

/** The selector of a tab button: `ship`, `backlog`, `done` or `cos`. */
export const tabSelector = (tab) => `button[data-tab="${tab}"]`

const BACKLOG_TAB = ['Backlog', 'Writing tickets']

/**
 * Where ticket `id`'s card is in a `stateAt` payload, as the dashboard page draws it, and which controls it offers: `{ tab, group, label, scope, controls }`, or null when the dashboard has no card for it.
 * `tab` is `ship`, `backlog` or `done`; `group` is the API group name and `label` the heading the page shows; `controls` lists the `buttonSelector` kinds that exist on the card
 * (`approve` and `changes` at awaiting-build and awaiting-merge, `spec` or `pr` with them, `todo` on a Backlog card, `agents` once a gantt has tasks, `details`).
 */
export function locate(api, id) {
  for (const group of api.status) {
    const row = group.rows.find((r) => r.id === id)
    if (!row) continue
    const tab = BACKLOG_TAB.includes(group.name) ? 'backlog' : 'ship'
    const controls = [
      ...(row.gantt && page.taskCount(row.gantt) > 0 ? ['agents'] : []),
      ...(row.helper ? [] : ['details']),
      ...(page.actionFor(row) ? [page.actionFor(row).label === 'View PR' ? 'pr' : 'spec'] : []),
      ...(page.approveCommand(row) ? ['approve', 'changes'] : []),
      ...(group.name === 'Backlog' && page.todoCommand(row) ? ['todo'] : []),
    ]
    return { tab, group: group.name, label: page.groupLabel(group.name), scope: 'ticket', controls }
  }
  const done = api.merged.find((e) => e.id === id)
  return done ? { tab: 'done', group: 'Merged', label: 'Done', scope: 'merged', controls: [...(done.gantt && page.taskCount(done.gantt) > 0 ? ['agents'] : []), 'details'] } : null
}
