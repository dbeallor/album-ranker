// Unified diff text (`git diff` / `gh pr diff`) to the files, hunks and lines a pull request's Files changed tab draws.

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/
const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/

/** `[{ path, oldPath, status, binary, additions, deletions, hunks: [{ header, lines: [{ k, o, n, t }] }] }]`; `k` is `+`, `-` or a space, `o` and `n` the old and new line numbers (null where a line has none). */
export function parseDiff(text) {
  return text.split(/^(?=diff --git )/m).filter((b) => b.startsWith('diff --git ')).map((block) => {
    const lines = block.split('\n')
    const [, oldPath, path] = /^diff --git a\/(.+) b\/(.+)$/.exec(lines[0])
    const file = { path, oldPath, status: 'modified', binary: false, additions: 0, deletions: 0, hunks: [] }
    let hunk, o = 0, n = 0
    for (const line of lines.slice(1)) {
      const h = HUNK.exec(line)
      if (h) { o = +h[1]; n = +h[2]; hunk = { header: line, lines: [] }; file.hunks.push(hunk); continue }
      if (!hunk) {
        if (line.startsWith('new file mode')) file.status = 'added'
        else if (line.startsWith('deleted file mode')) file.status = 'deleted'
        else if (line.startsWith('rename from')) file.status = 'renamed'
        else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) file.binary = true
        continue
      }
      const k = line[0]
      if (k === '+') { hunk.lines.push({ k, o: null, n: n++, t: line.slice(1) }); file.additions++ }
      else if (k === '-') { hunk.lines.push({ k, o: o++, n: null, t: line.slice(1) }); file.deletions++ }
      else if (k === ' ') hunk.lines.push({ k, o: o++, n: n++, t: line.slice(1) })
    }
    return file
  })
}

/**
 * Decides what the Files changed tab shows of each file: `open` (its lines are shown) for the first `open` files that are neither binary nor large, with at most `cap` lines (the rest counted in `hidden`),
 * and a `note` for the files GitHub does not render (binary, or more than `large` changed lines or a lockfile).
 */
export function layout(files, { open = 3, large = 300, cap = 140 } = {}) {
  let opened = 0
  return files.map((f) => {
    const note = f.binary ? 'Binary file not shown.' : f.additions + f.deletions > large || LOCKFILES.test(f.path) ? 'Large diffs are not rendered by default.' : ''
    if (note || opened >= open) return { ...f, hunks: [], open: false, note, hidden: 0 }
    opened++
    let room = cap, hidden = 0
    const hunks = f.hunks.map((h) => {
      const shown = h.lines.slice(0, Math.max(0, room))
      room -= shown.length; hidden += h.lines.length - shown.length
      return { ...h, lines: shown }
    }).filter((h) => h.lines.length)
    return { ...f, hunks, open: true, note: '', hidden }
  })
}
