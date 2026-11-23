import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import { collectSources } from "./files.ts";

/**
 * Writes the events Lambda function (lambda/events.ts, ALBUM-85) to `outDir` as plain JavaScript. Node on Lambda does not
 * strip types from the handler file, so each source file the handler imports is transpiled to `.js` with its relative
 * imports pointing at `.js`, and a package.json saying "module" makes Node read them as ES modules. The handler is
 * `lambda/events.handler`. It imports no packages, so nothing else ships.
 */
export function buildEventsPackage(root: string, outDir: string, entry = "lambda/events.ts"): string[] {
  const { files, packages } = collectSources(root, entry);
  if (packages.length > 0) throw new Error(`${entry} imports packages (${packages.join(", ")}), but the events function ships none.`);

  rmSync(outDir, { recursive: true, force: true });
  for (const file of files) {
    const { outputText } = ts.transpileModule(readFileSync(join(root, file), "utf8"), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        rewriteRelativeImportExtensions: true,
        verbatimModuleSyntax: true,
      },
    });
    const target = join(outDir, file.replace(/\.ts$/, ".js"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, outputText);
  }
  writeFileSync(join(outDir, "package.json"), '{ "type": "module" }\n');
  return files;
}
