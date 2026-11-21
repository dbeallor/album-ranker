# Stage API

`static/stage.html` is a 1920x1280 page (the 1920x1200 app plus an 80px caption strip beneath it) that looks like the T3 Code desktop app: left sidebar of threads, a chat thread in the middle, a built-in browser on the right. The app UI is drawn at 1800x1125 and scaled by 1.0667. The caption strip sits under the app, so it never covers the composer or model picker. The cursor, ripple, time-lapse chip and intro overlays sit above it in true page pixels. Everything is exposed on `window.S`. Call it with `page.evaluate`.

The dashboard is `<iframe id="dash" src="/dash.html">`, shown only while the dash tab is selected (it is `visibility:hidden` otherwise, never removed).

Times shown in the UI are labels the driver passes in (for example `6:20 p.m.`, America/New_York, 12-hour).

## Setup and chrome

| Call | Behavior |
| --- | --- |
| `setup({project, projectAvatar, thread, branch, model, effort, settled})` | Initial state. Sets the active sidebar row, the thread breadcrumb and the composer model picker. `settled` is the Settled count before any other thread settles (default 146). Example: `{project:'Album Ranker', projectAvatar:'AR', thread:'ALBUM - Chief of Staff', branch:'main', model:'Sonnet 5.5', effort:'Medium'}`. |
| `setModel(model, effort)` | Updates the composer model picker (`Sonnet 5.5 Medium`). |
| `setSidebarStatus({section, label, age})` | `section` is `'working'`, `'settled'` or `'idle'`. `'working'` moves the active thread into the bottom "Working" group and shows `label` (for example `Waiting 1m`) with a spinner. `'settled'` and `'idle'` put the row back in the top list showing `age` (`now`, `2m`, `4h`, `3d`). |
| `setSidebarThreads([{title, branch, working, label, age}])` | The project's other top-level threads. A `working` row sits in the Working group next to the active thread (spinner and `label`); a row that is not working has settled and is only counted: Settled shows `settled` plus the number of those. Call again with the rows as they are at each instant. |
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
| `addUser(text, attachLabel, sender)` | Moves the draft into a user bubble (blank lines split paragraphs), clears the composer, scrolls to the end. `sender` puts a small uppercase label above the text, for a message an agent sent. Called without typing first, it is how a message that was not typed appears. |
| `working(on)` | Shows or hides the `Working` indicator in the thread and sets the sidebar status (`working` / `settled`). Call `setSidebarStatus` afterwards to override the label. |
| `addAssistant(markdown) -> childCount` | Appends an assistant message with all blocks hidden and returns the block count. Hides the working indicator. A fenced block (also one indented inside a list item) is a code block. |
| `reveal(k)` | Shows the first `k` blocks of the latest assistant message and scrolls to the end. |
| `bottom()` | Scrolls the open thread to its end and hides the `Scroll to end` pill. |
| `chatScroll(y)` | Sets the chat's scroll position. The `Scroll to end` pill (`#toend`) shows above the composer while the chat is more than 60 px from its end. |
| `chatMetrics() -> {top, height, view, messages}` | Scroll position, scroll height, visible height and message count of the chat. |
| `addWorked(label)` | Adds the dim collapsible line, for example `addWorked('Worked for 25s')`. |

## Child thread cards and wait bar

| Call | Behavior |
| --- | --- |
| `addChildCard({id, title, subtitle, model, status, timeLabel})` | Appends an inline card to the chat. `status` is `'running'` (blue dot, right side `Running <timeLabel>`) or `'finished'` (green dot, `Finished <timeLabel>`). `model` (`'Opus 5.5'`) shows as a small muted tag after the title. |
| `updateChildCard(id, {subtitle, status, timeLabel, model})` | Patches any of the fields and re-renders the card. |
| `setWaitBar(null \| {title, elapsed} \| {label, detail})` | `{title, elapsed}` shows `Waiting · <title>  <elapsed>  Details  Open  Stop` above the composer. `{label, detail}` is the bar for several children: `Waiting on 2 subagents and 1 command  <detail>  (i)  Details  Stop` (see `refs-local/t3-e.jpg`). `null` clears it. Call again to tick the elapsed text. |
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
| `browserTabs([{id, title, kind, url, favicon}])` | Replaces the tab strip. `kind` is `'dash'` or `'gh'`; `favicon` is `'dash'` or `'github'`. Creates one page container per gh tab and drops the ones no longer listed (closing a tab is listing the others). In the expanded browser a tab is up to 290 px wide. Keeps the active tab if it still exists, otherwise selects the first. |
| `browserSelect(id)` | Activates a tab. The dash tab shows the iframe, gh tabs show their page. Sets the address bar to the tab URL. |
| `tabHover(id)` | Marks a tab as hovered (its close button shows); `null` clears. |
| `browserUrl(url, select)` | Sets the address text. `select = true` shows the highlighted, selected address with the red focus ring seen in the recordings. |
| `browserExpand(on)` | `true` hides the chat and widens the browser to the full area right of the sidebar (the layout in the blob page stills). `false` is the narrow right pane. |
| `ghPage(tabId, html)` | Sets a gh tab's content from one of the builders below. |
| `ghScroll(y)` | Sets the scroll position of the active gh page's scroller. |
| `ghScrollTo(text) -> y` | Scroll position that puts the first heading containing `text` near the top. Does not scroll. |
| `ghScrollHeight() -> number` | `scrollHeight` of the active gh scroller. |
| `ghTabSwitch(n)` | Switches PR sub-tab: `0` Conversation, `1` Files changed. Resets scroll and appends `/files` to the address for `1`. |

Click targets:

- Tabs: `#tabs .tab[data-tab-id="<id>"]`; a GitHub tab's close button `#tabs .tab[data-tab-id="<id>"] .x` (shown on the active tab and on a hovered one)
- Dash content: `frameLocator('#dash')`
- PR sub-tabs: `.ghp.on .g-tabs [data-n="0"]` and `[data-n="1"]`
- Scroller: `.ghp.on .gsc`

## GitHub page builders

Each returns an HTML string for `ghPage`. They take real data, nothing is hardcoded.

- `ghBlobPage({path, sha, md, lines, size, tree})`: spec file page. `path` is the repo path of the file, `sha` the short commit in the picker, `md` the file text, `lines` the line count, `size` bytes (shown as `20 KB` or `17.3 KB`), `tree` an array of repo file paths (for example `['docs/agents/project.md', '<spec path>', '.gitignore', 'README.md']`). Renders the Files panel (folders on the selected path are open, single-child folders collapse into `superpowers/specs`), breadcrumb, `Preview | Code | Blame`, `N lines (loc) · size`, and the rendered markdown. The Files panel only shows in expanded browser mode.
- `ghPrPage({pr, state, bodyMd, comments, commits, files, checks, mergeable})`: `pr` is `{title, number, headRefName, author?}`; `state` is `OPEN`, `MERGED` or `CLOSED` (badge, wording and merge box follow it: a merged PR shows the purple `Pull request successfully merged and closed` box); `comments` are `{author:{login}, createdAt, body}` (a `Verdict: PASS` or `Verdict: CHANGES NEEDED` line becomes a green or amber badge); `commits` is the commit count; `files` are the parsed and laid-out diff files of `lib/diff.mjs` (`{path, oldPath, status, additions, deletions, hunks, open, note, hidden}`); `checks` are `{name, state}` (empty array shows "No checks configured"); `mergeable` toggles the green merge box with the `Merge pull request` button. Two panes: Conversation, and Files changed, which has the summary, a file list with `+`/`-` counts, then each file: expanded ones show their hunks with old and new line numbers and green or red rows (`hidden` lines past the cap are counted in a row), collapsed ones show the header only, with `note` (`Binary file not shown.`, `Large diffs are not rendered by default.`) where there is one.
- `ghIssuePage({number, title, state, author, bodyMd, labels, comments})`: `state` is `OPEN` or `CLOSED`, `labels` are `{name, color}` (hex without `#`), `comments` are `{author:{login}, createdAt, body}`.
