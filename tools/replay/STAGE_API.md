# Stage API

`static/stage.html` is a 1920x1280 page (the 1920x1200 app plus an 80px caption strip beneath it) that looks like the T3 Code desktop app: left sidebar of threads, a chat thread in the middle, a built-in browser on the right. The app UI is drawn at 1800x1125 and scaled by 1.0667. The caption strip sits under the app, so it never covers the composer or model picker. The cursor, ripple, time-lapse chip and intro overlays sit above it in true page pixels. Everything is exposed on `window.S`. Call it with `page.evaluate`.

The dashboard is `<iframe id="dash" src="/dash.html">`, shown only while the dash tab is selected (it is `visibility:hidden` otherwise, never removed).

Times shown in the UI are labels the driver passes in (for example `6:20 p.m.`, America/New_York, 12-hour).

## Setup and chrome

| Call | Behavior |
| --- | --- |
| `setup({project, projectAvatar, thread, branch, model, effort})` | Initial state. Sets the active sidebar row, the thread breadcrumb and the composer model picker. Example: `{project:'Album Ranker', projectAvatar:'AR', thread:'ALBUM - Chief of Staff', branch:'main', model:'Sonnet 5.5', effort:'Medium'}`. |
| `setModel(model, effort)` | Updates the composer model picker (`Sonnet 5.5 Medium`). |
| `setSidebarStatus({section, label, age})` | `section` is `'working'`, `'settled'` or `'idle'`. `'working'` moves the active thread into the bottom "Working 1" group and shows `label` (for example `Waiting 1m`) with a spinner, and Settled drops to 146. `'settled'` and `'idle'` put the row back in the top list showing `age` (`now`, `2m`). |
| `intro(on)` | Shows or hides the title overlay. |
| `caption(text)` | Sets the caption strip under the app. |
| `timelapse(text)` | Shows the top-center fast-forward pill, for example `⏩ 6:43 p.m. → 6:51 p.m.`. Empty string hides it. |
| `cursor(x, y)` | Moves the fake cursor to page pixel `(x, y)`. |
| `ripple(p)` | `p` in 0..1 animates a click ripple at the cursor. `0` hides it. |

## Chat thread

| Call | Behavior |
| --- | --- |
| `md(src) -> string[]` | Markdown to one HTML string per top-level block. Supports headings, paragraphs (single newlines join with a space), nested bullet and numbered lists, tables, fenced code, blockquotes, rules, bold, italic, inline code, `[text](url)` and bare URLs (GitHub URLs get a GitHub icon in chat). |
| `composer(text, attachLabel)` | Renders the draft in the composer with a caret and enables the orange send button when `text` is non-empty. `attachLabel` such as `'Best Albums.xlsx 299 KB'` shows the green file chip (name, then size). Empty text and no label shows the placeholder. The composer grows upward with long drafts. |
| `addUser(text, attachLabel)` | Moves the draft into a user bubble (blank lines split paragraphs), clears the composer, scrolls to the end. |
| `working(on)` | Shows or hides the `Working` indicator in the thread and sets the sidebar status (`working` / `settled`). Call `setSidebarStatus` afterwards to override the label. |
| `addAssistant(markdown) -> childCount` | Appends an assistant message with all blocks hidden and returns the block count. Hides the working indicator. |
| `reveal(k)` | Shows the first `k` blocks of the latest assistant message and scrolls to the end. |
| `bottom()` | Scrolls the open thread to its end. |
| `addWorked(label)` | Adds the dim collapsible line, for example `addWorked('Worked for 25s')`. |

## Child thread cards and wait bar

| Call | Behavior |
| --- | --- |
| `addChildCard({id, title, subtitle, model, status, timeLabel})` | Appends an inline card to the chat. `status` is `'running'` (blue dot, right side `Running <timeLabel>`) or `'finished'` (green dot, `Finished <timeLabel>`). `model` (`'Opus 5.5'`) shows as a small muted tag after the title. |
| `updateChildCard(id, {subtitle, status, timeLabel, model})` | Patches any of the fields and re-renders the card. |
| `setWaitBar(null \| {title, elapsed})` | Shows `Waiting · <title>  <elapsed>  Details  Open  Stop` above the composer. `null` clears it. Call again to tick the elapsed text. |
| `setThreadMessages(id, [{role, md}])` | Stores read-only messages for a child thread (`role` is `'user'` or `'assistant'`). |
| `openThread(id)` | Shows the child thread in the center pane (breadcrumb `Project / <card title>`, the card's model in the model picker, wait bar hidden). |
| `closeThread()` | Returns to the chief thread. |

Click targets:

- Card: `#msgs .card[data-child-id="<id>"]`
- Wait bar buttons: `#wait b` (Details, Stop) and the `Open` span inside `#wait`
- Composer: `#comp`, send button `#send`
- Sidebar rows: `#tlist .trow`, active row `.trow.act`

## Browser

| Call | Behavior |
| --- | --- |
| `browserTabs([{id, title, kind, url, favicon}])` | Replaces the tab strip. `kind` is `'dash'` or `'gh'`; `favicon` is `'dash'` or `'github'`. Creates one page container per gh tab and drops the ones no longer listed. Keeps the active tab if it still exists, otherwise selects the first. |
| `browserSelect(id)` | Activates a tab. The dash tab shows the iframe, gh tabs show their page. Sets the address bar to the tab URL. |
| `browserUrl(url, select)` | Sets the address text. `select = true` shows the highlighted, selected address with the red focus ring seen in the recordings. |
| `browserExpand(on)` | `true` hides the chat and widens the browser to the full area right of the sidebar (the layout in the blob page stills). `false` is the narrow right pane. |
| `ghPage(tabId, html)` | Sets a gh tab's content from one of the builders below. |
| `ghScroll(y)` | Sets the scroll position of the active gh page's scroller. |
| `ghScrollTo(text) -> y` | Scroll position that puts the first heading containing `text` near the top. Does not scroll. |
| `ghScrollHeight() -> number` | `scrollHeight` of the active gh scroller. |
| `ghTabSwitch(n)` | Switches PR sub-tab: `0` Conversation, `1` Files changed. Resets scroll and appends `/files` to the address for `1`. |

Click targets:

- Tabs: `#tabs .tab[data-tab-id="<id>"]`
- Dash content: `frameLocator('#dash')`
- PR sub-tabs: `.ghp.on .g-tabs [data-n="0"]` and `[data-n="1"]`
- Scroller: `.ghp.on .gsc`

## GitHub page builders

Each returns an HTML string for `ghPage`. They take real data, nothing is hardcoded.

- `ghBlobPage({path, sha, md, lines, size, tree})`: spec file page. `path` is the repo path of the file, `sha` the short commit in the picker, `md` the file text, `lines` the line count, `size` bytes (shown as `20 KB` or `17.3 KB`), `tree` an array of repo file paths (for example `['docs/agents/project.md', '<spec path>', '.gitignore', 'README.md']`). Renders the Files panel (folders on the selected path are open, single-child folders collapse into `superpowers/specs`), breadcrumb, `Preview | Code | Blame`, `N lines (loc) · size`, and the rendered markdown. The Files panel only shows in expanded browser mode.
- `ghPrPage({pr, bodyMd, comments, files, diffLines, checks, mergeable})`: `pr` is `{title, number, headRefName, author?, commits?}`; `comments` are `{author:{login}, createdAt, body}` (a `Verdict: PASS` or `Verdict: CHANGES NEEDED` line becomes a green or amber badge); `files` are `{path, additions, deletions}`; `diffLines` are the added file's lines with no trailing empty entry; `checks` are `{name, state}` (empty array shows "No checks configured"); `mergeable` toggles the green merge box with the `Merge pull request` button. Two panes: Conversation and Files changed (unified diff of the added file, green rows).
- `ghIssuePage({number, title, state, author, bodyMd, labels})`: `state` is `OPEN` or `CLOSED`, `labels` are `{name, color}` (hex without `#`).
