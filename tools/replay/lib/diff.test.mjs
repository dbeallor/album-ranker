import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { parseDiff, layout } from './diff.mjs'

const SAMPLE = `diff --git a/a.txt b/a.txt
index 1..2 100644
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@ title
 keep
-old
+new
 end
diff --git a/b.png b/b.png
new file mode 100644
Binary files /dev/null and b/b.png differ
diff --git a/c.ts b/c.ts
new file mode 100644
--- /dev/null
+++ b/c.ts
@@ -0,0 +1,2 @@
+one
+two
`

test('parses files, statuses, counts and line numbers', () => {
  const [a, b, c] = parseDiff(SAMPLE)
  assert.deepEqual([a.path, a.status, a.additions, a.deletions], ['a.txt', 'modified', 1, 1])
  assert.deepEqual(a.hunks[0].lines.map((l) => [l.k, l.o, l.n, l.t]), [[' ', 1, 1, 'keep'], ['-', 2, null, 'old'], ['+', null, 2, 'new'], [' ', 3, 3, 'end']])
  assert.deepEqual([b.path, b.status, b.binary], ['b.png', 'added', true])
  assert.deepEqual([c.status, c.additions, c.hunks[0].lines[1].n], ['added', 2, 2])
})

test('layout opens the first files, notes binary and large ones, caps lines', () => {
  const files = parseDiff(SAMPLE)
  const out = layout(files, { open: 1, cap: 2 })
  assert.equal(out[0].open, true)
  assert.equal(out[0].hidden, 2)
  assert.equal(out[1].note, 'Binary file not shown.')
  assert.equal(out[2].open, false)
  assert.equal(layout(files, { large: 1 })[0].note, 'Large diffs are not rendered by default.')
})

test('every recorded pull request diff parses with the counts the PR lists', () => {
  const dir = new URL('../fixtures/2026-11-21/', import.meta.url).pathname
  for (const n of [18, 21, 22]) {
    const pr = JSON.parse(fs.readFileSync(`${dir}pr-${n}.json`, 'utf8'))
    const files = parseDiff(fs.readFileSync(`${dir}pr-${n}.diff`, 'utf8'))
    assert.equal(files.length, pr.changedFiles)
    for (const f of files) {
      const listed = pr.files.find((x) => x.path === f.path)
      if (!f.binary) assert.deepEqual([f.additions, f.deletions], [listed.additions, listed.deletions], f.path)
    }
  }
})
