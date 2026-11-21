import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Playwright loads this file as CommonJS (`__dirname`); `node scripts/record.ts` loads it as ESM (`import.meta`).
const here = typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/**
 * The script that `page.addInitScript` runs in every page and frame; it records only top-level http(s) pages. It is `recorder.ts`
 * transpiled to plain JavaScript and wrapped in a function, so it needs no bundler and
 * nothing from the app. It sends each event to the `__albumRecorderSend` binding.
 */
export function recorderScript(): string {
  const source = readFileSync(path.join(here, "recorder.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });

  return `(function () {
  if (window !== window.top || !/^https?:$/.test(location.protocol)) { return; }
  var exports = {};
  var module = { exports: exports };
${outputText}
  exports.installRecorder(function (event) {
    try {
      Promise.resolve(window.__albumRecorderSend(event)).catch(function () {});
    } catch (error) {}
  });
})();`;
}
