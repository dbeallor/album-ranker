// Selectors and chief-thread text for the dashboard's ticket controls (page/app.js: ticket(), approveControls(), todoControl()).

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
  spec: (t) => `${card(t)} a.action`,
  pr: (t) => `${card(t)} a.action`,
  agents: (t, scope) => `button.seg[data-${scope}="${t}"][data-view="agents"]`,
  details: (t, scope) => `button.seg[data-${scope}="${t}"][data-view="details"]`,
}

/**
 * The selector (inside the dashboard iframe) of one control: `approve` (Approve), `changes` (Changes), `todo` (Start shipping), `spec` (View spec), `pr` (View PR), `agents`, `details`.
 * `scope` is `ticket` for the Ship loop and Backlog tabs, `merged` for the Done tab; it matters for `agents` and `details` only.
 */
export const buttonSelector = (kind, ticket, scope = 'ticket') => SELECTORS[kind](ticket, scope)

/** The selector of a tab button: `ship`, `backlog`, `done` or `cos`. */
export const tabSelector = (tab) => `button[data-tab="${tab}"]`
