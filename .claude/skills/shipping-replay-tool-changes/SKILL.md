---
name: shipping-replay-tool-changes
description: How to ship a change to the replay video tooling (tools/replay) or its skills as its own PR from a fresh worktree. Use when editing the stage, director, timeline or story code, adding a browser tab kind, updating the replay skills, or when asked to PR the replay tool.
user-invocable: true
---

# Ship replay tool changes

## When to use

- Any change under `tools/replay/` or `.claude/skills/replay-*` or this skill.
- Not for rendering a video only (a new story and fixtures are still tool-adjacent: they go in the same kind of PR, without the video).

## Steps

1. **New worktree, not the main checkout.** The planning model delegates file edits to the `implementer` subagent (user's global rule).
   `git fetch origin && git worktree add ~/.t3/worktrees/album-ranker/<name> -b infra/<name> origin/main`
2. Make the change in that worktree. Keep it self-contained: `tools/replay` has its own `package.json` (`cd tools/replay && npm ci`).
3. **Test:** `cd tools/replay && node --test lib/`. For stage or director changes also smoke render one beat: `BEATS=7 FINAL=$PWD/out/smoke.mp4 node render.mjs story/<date>.mjs`.
4. **Nothing generated.** No videos, `out/`, `refs-local/`, `node_modules/`, screen recordings. Check `git status` before `git add tools/replay .claude/skills`.
5. **Commit** (conventional): `infra: <what changed>`; the message ends with
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
6. **Push and open the PR:** `git push -u origin infra/<name>`, then
   `~/.collective-wisdom/scripts/gh.sh pr create --repo dbeallor/album-ranker --base main --title "infra: <title>" --body-file <file>`.
   Body sections: what, why, how verified. End the body with the line
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
7. **Checks:** `~/.collective-wisdom/scripts/gh.sh pr checks <N> --repo dbeallor/album-ranker` and watch them per the project rules. If the repo has no CI, say so.
8. **Link the PR in the T3 thread** the work came from. Leave merging to the user.

## Notes

- Never use bare `gh`; always `~/.collective-wisdom/scripts/gh.sh`.
- Branch has no ticket number, so it does not follow `infra/<prefix>-N`.
- Keep `tools/replay` out of the Next.js app's lint and typecheck when the app is scaffolded.
