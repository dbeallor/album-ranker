// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the ALBUM-31 design rules: raw colors live only in app/globals.css, and the only inline
 * styles are the dynamic ones below. Everything else uses design tokens and CSS Modules.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCANNED_DIRS = ["app", "components"];
const TOKENS_FILE = "app/globals.css";

/** Inline `style` props that must stay inline because their values change every frame or per instance. */
const INLINE_STYLE_ALLOWLIST: Record<string, string[]> = {
  "components/decade-list.tsx": ["transform", "transition", "zIndex", "opacity"],
  "components/year-screen.tsx": ["transform", "zIndex", "opacity"],
  "components/cover.tsx": ["--cover-size"],
};

const NAMED_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
    "darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
    "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew " +
    "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue " +
    "mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple " +
    "rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue " +
    "slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
    "whitesmoke yellow yellowgreen"
  ).split(" "),
);

/** CSS system colors adapt to the theme, but they bypass the tokens, so CSS may not use them either. Too generic to flag as TSX strings. */
const SYSTEM_COLORS = new Set(
  (
    "canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight " +
    "highlighttext graytext mark marktext selecteditem selecteditemtext accentcolor accentcolortext"
  ).split(" "),
);

// Hex colors, and color functions of any space.
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/i;

type Source = { path: string; text: string };
type Finder = (source: Source) => string[];

function listFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Every app and component source the rules cover: `.tsx` and `.css`, but not tests and not the token file. */
function sources(): Source[] {
  return SCANNED_DIRS.flatMap(listFiles)
    .map((path) => path.split(sep).join("/"))
    .filter((path) => (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) || path.endsWith(".css"))
    .filter((path) => path !== TOKENS_FILE)
    .map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));
}

function stripComments(path: string, text: string): string {
  const blocks = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  // A `//` after a colon is a URL; only strip it at the start of a line or after whitespace.
  return path.endsWith(".css") ? blocks : blocks.replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** The declaration values in CSS: everything between a `:` and the `;` or `}` that ends it. */
function cssValues(css: string): string[] {
  const values: string[] = [];
  for (const [, statement, end] of css.matchAll(/([^{};]+)([{};])/g)) {
    if (end === "{") continue; // a selector or at-rule prelude, not a declaration
    const colon = statement.indexOf(":");
    if (colon !== -1) values.push(statement.slice(colon + 1));
  }
  return values;
}

function namedColorsIn(value: string, includeSystem: boolean): string[] {
  const bare = value.replace(/var\([^)]*\)|url\([^)]*\)|"[^"]*"|'[^']*'/g, " ");
  return (bare.match(/[a-zA-Z]+/g) ?? []).filter(
    (word) => NAMED_COLORS.has(word.toLowerCase()) || (includeSystem && SYSTEM_COLORS.has(word.toLowerCase())),
  );
}

const findColors: Finder = ({ path, text }) => {
  // An in-page anchor such as href="#add" looks like a short hex color; it is not one.
  const code = stripComments(path, text).replace(/\b(?:href|to|id|htmlFor|aria-[a-z]+)\s*=\s*\{?\s*["'`]#\w+/g, " ");
  const found: string[] = [];
  const hex = code.match(new RegExp(HEX_COLOR, "g"));
  if (hex) found.push(...hex);
  const functions = code.match(new RegExp(COLOR_FUNCTION, "gi"));
  if (functions) found.push(...functions);

  if (path.endsWith(".css")) {
    found.push(...cssValues(code).flatMap((value) => namedColorsIn(value, true)));
  } else {
    // In TSX a named color can only appear in a string. Catch a whole-string name ("red") and
    // the value of a color-like property or attribute (borderColor: "red", fill="red").
    for (const [, , word] of code.matchAll(/(["'`])([a-zA-Z]+)\1/g)) {
      if (NAMED_COLORS.has(word.toLowerCase())) found.push(word);
    }
    for (const [, value] of code.matchAll(/\b(?:[a-zA-Z]*[cC]olor|background|border|outline|fill|stroke|boxShadow)\s*[:=]\s*\{?\s*(["'`][^"'`]*["'`])/g)) {
      found.push(...namedColorsIn(value.replace(/^["'`]|["'`]$/g, ""), false));
    }
  }
  return found.map((color) => `${path}: raw color ${color}`);
};

/** The text of the balanced `{...}` that starts at `open`, without the outer braces. Skips strings and template literals. */
function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (char === '"' || char === "'" || char === "`") {
      const close = text.indexOf(char, i + 1);
      if (close === -1) break;
      i = close;
    } else if (char === "{" || char === "(" || char === "[") {
      depth++;
    } else if (char === "}" || char === ")" || char === "]") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return text.slice(open + 1);
}

/** The property names of an object literal. A spread or a computed key comes back as itself, so it can't be allowlisted. */
function objectKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let segment = "";
  const flush = () => {
    const piece = segment.trim();
    segment = "";
    if (piece === "") return;
    const match = piece.match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/);
    keys.push(match ? (match[1] ?? match[2] ?? match[3]) : piece);
  };
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '"' || char === "'" || char === "`") {
      const close = body.indexOf(char, i + 1);
      const end = close === -1 ? body.length - 1 : close;
      segment += body.slice(i, end + 1);
      i = end;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") depth++;
    if (char === "}" || char === ")" || char === "]") depth--;
    if (char === "," && depth === 0) flush();
    else segment += char;
  }
  flush();
  return keys;
}

const findInlineStyles: Finder = ({ path, text }) => {
  const code = stripComments(path, text);
  if (path.endsWith(".css")) return [];
  const allowed = INLINE_STYLE_ALLOWLIST[path] ?? [];
  const problems: string[] = [];
  for (const match of code.matchAll(/\bstyle\s*=\s*\{/g)) {
    const expression = balanced(code, match.index + match[0].length - 1).trim();
    // Only an inline object literal can be checked, so `style={someObject}` is not allowed anywhere.
    if (!expression.startsWith("{")) {
      problems.push(`${path}: style prop is not an inline object literal`);
      continue;
    }
    for (const key of objectKeys(balanced(expression, 0))) {
      if (!allowed.includes(key)) problems.push(`${path}: inline style ${key}`);
    }
  }
  return problems;
};

const rules: { name: string; find: Finder }[] = [
  { name: "no raw colors in app or components outside app/globals.css", find: findColors },
  { name: "no inline style props outside the allowlist of dynamic cases", find: findInlineStyles },
];

describe("design system", () => {
  it("scans the app and component sources", () => {
    const paths = sources().map((source) => source.path);
    expect(paths).toContain("components/ui/button.module.css");
    expect(paths).toContain("components/decade-list.tsx");
    expect(paths).not.toContain(TOKENS_FILE);
    expect(paths.some((path) => path.endsWith(".test.tsx"))).toBe(false);
    for (const path of Object.keys(INLINE_STYLE_ALLOWLIST)) expect(paths).toContain(path);
  });

  it.each(rules)("$name", ({ find }) => {
    expect(sources().flatMap(find)).toEqual([]);
  });

  // The rules must actually catch what they are for, or the scan above proves nothing.
  const samples: { name: string; rule: Finder; path: string; text: string; expected: number }[] = [
    { name: "hex in css", rule: findColors, path: "components/a.module.css", text: ".a { color: #fff; }", expected: 1 },
    { name: "8 digit hex in tsx", rule: findColors, path: "components/a.tsx", text: 'const c = "#aabbccdd";', expected: 1 },
    { name: "rgb in css", rule: findColors, path: "components/a.module.css", text: ".a { background: rgb(0 0 0 / 0.5); }", expected: 1 },
    { name: "hsl in css", rule: findColors, path: "components/a.module.css", text: ".a { background: hsl(10 20% 30%); }", expected: 1 },
    { name: "named color in css", rule: findColors, path: "components/a.module.css", text: ".a { border: 1px solid red; }", expected: 1 },
    { name: "named color in a css shadow", rule: findColors, path: "components/a.module.css", text: ".a { box-shadow: 0 0 2px Tomato; }", expected: 1 },
    { name: "named color in a tsx string", rule: findColors, path: "components/a.tsx", text: 'const c = "red";', expected: 1 },
    { name: "named color in a tsx property", rule: findColors, path: "components/a.tsx", text: 'const s = { borderColor: "1px solid teal" };', expected: 1 },
    { name: "tokens, transparent and currentcolor are fine", rule: findColors, path: "components/a.module.css", text: ".a { color: var(--color-text); background: transparent; border-color: currentcolor; }", expected: 0 },
    { name: "a color in a comment is fine", rule: findColors, path: "components/a.module.css", text: "/* #fff red rgb(0 0 0) */ .a { color: var(--color-text); }", expected: 0 },
    { name: "an anchor and a word in tsx are fine", rule: findColors, path: "components/a.tsx", text: '<a href="#add">Redo the tan list</a> // #fff', expected: 0 },
    { name: "a short hex color in tsx is caught", rule: findColors, path: "components/a.tsx", text: 'const c = "#add";', expected: 1 },
    { name: "custom property values are checked", rule: findColors, path: "components/a.module.css", text: ".a { --x: #123; }", expected: 1 },
    { name: "inline style outside the allowlist", rule: findInlineStyles, path: "components/a.tsx", text: "<div style={{ display: 'flex', gap: 8 }} />", expected: 2 },
    { name: "style object in a variable", rule: findInlineStyles, path: "components/a.tsx", text: "<div style={style} />", expected: 1 },
    { name: "spread in an inline style", rule: findInlineStyles, path: "components/year-screen.tsx", text: "<div style={{ ...rowStyle, transform }} />", expected: 1 },
    { name: "allowlisted drag style", rule: findInlineStyles, path: "components/year-screen.tsx", text: "<div style={{ transform: t ? `translate3d(${t.x}px, ${t.y}px, 0)` : undefined, zIndex: d ? 10 : undefined, opacity: d ? 0.85 : undefined }} />", expected: 0 },
    { name: "extra key next to an allowlisted one", rule: findInlineStyles, path: "components/year-screen.tsx", text: "<div style={{ transform, color: 'red' }} />", expected: 1 },
    { name: "allowlisted cover size", rule: findInlineStyles, path: "components/cover.tsx", text: 'const a = <div style={{ "--cover-size": `${size}px` } as CSSProperties} />;', expected: 0 },
    { name: "allowlist is per file", rule: findInlineStyles, path: "components/cover.tsx", text: "<div style={{ transform }} />", expected: 1 },
    { name: "style in a comment is fine", rule: findInlineStyles, path: "components/a.tsx", text: "/* style={{ gap: 8 }} */\n// style={{ gap: 8 }}\n<div />", expected: 0 },
  ];

  it.each(samples)("detects: $name", ({ rule, path, text, expected }) => {
    expect(rule({ path, text })).toHaveLength(expected);
  });
});
