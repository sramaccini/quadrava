// Writes projects/components/src/lib/nz-dark-theme.generated.ts: the rules of the NG-ZORRO dark stylesheet that use its
// own fixed colours (primary blue, error red, success green, warning gold) with those colours replaced by the variables of
// the platform theme. Loaded after that stylesheet with dark themes, so that buttons, links, tabs, tags, checkboxes… take the
// colours of the theme and keep the contrast the theme guarantees.
//   node tools/nz-dark-theme.mjs            write the file
//   node tools/nz-dark-theme.mjs --check    fail if the file is not up to date (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = join(root, 'node_modules/ng-zorro-antd/ng-zorro-antd.dark.min.css');
const target = join(root, 'projects/components/src/lib/nz-dark-theme.generated.ts');

/** The fixed colours of the dark stylesheet, by family and role; base, hover, active, light background, light border. */
const FAMILIES = {
  primary: { base: ['#177ddc'], hover: ['#165996', '#388ed3', '#3c9be8'], active: ['#095cb5', '#0e4980'], bg: ['#111b26', '#11263c'], border: ['#153450'] },
  error: { base: ['#a61d24'], hover: ['#d32029', '#b33b3d'], active: ['#800f19'], bg: ['#2a1215'], border: ['#58181c'] },
  success: { base: ['#49aa19'], hover: [], active: [], bg: ['#162312'], border: ['#274916'] },
  warning: { base: ['#d89614'], hover: [], active: [], bg: ['#2b2111'], border: ['#594214'] },
};
const VARIABLE = {
  base: (f) => `var(--ant-${f}-color)`,
  hover: (f) => `var(--ant-${f}-color-hover)`,
  active: (f) => `var(--ant-${f}-color-active)`,
  bg: (f) => (f === 'primary' ? 'var(--ant-primary-1)' : `var(--ant-${f}-color-deprecated-bg)`),
  border: (f) => (f === 'primary' ? 'var(--ant-primary-3)' : `var(--ant-${f}-color-deprecated-border)`),
};
const colours = new Map();
for (const [family, roles] of Object.entries(FAMILIES)) for (const [role, list] of Object.entries(roles)) for (const c of list) colours.set(c, { family, role });
const COLOUR = /#[0-9a-f]{6}\b/gi;
const familyOf = (value) => (value.match(COLOUR) ?? []).map((c) => colours.get(c.toLowerCase())).find(Boolean);

/** Splits minified CSS into its top-level blocks: `{ prelude, body }`, with nested blocks for at-rules. */
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (depth > 0 && j < css.length) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    out.push({ prelude, body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

/** Declarations of a rule split on `;` outside parentheses (data URIs contain `;`). */
function declarations(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < body.length; k++) {
    if (body[k] === '(') depth++;
    else if (body[k] === ')') depth--;
    else if (body[k] === ';' && depth === 0) {
      out.push(body.slice(start, k));
      start = k + 1;
    }
  }
  out.push(body.slice(start));
  return out.map((d) => d.trim()).filter(Boolean);
}

/** Splits a selector list on the commas outside parentheses. */
function selectors(prelude) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < prelude.length; k++) {
    if (prelude[k] === '(') depth++;
    else if (prelude[k] === ')') depth--;
    else if (prelude[k] === ',' && depth === 0) {
      out.push(prelude.slice(start, k).trim());
      start = k + 1;
    }
  }
  out.push(prelude.slice(start).trim());
  return out;
}

const WHITE = /#fff(fff)?\b/gi;
const FILL_ROLES = new Set(['base', 'hover', 'active']);
/** The family of a rule filled with a strong colour of the family (a primary button, a checked box…), if any. */
function fillOf(list) {
  for (const d of list) {
    if (!/^background(-color)?:/.test(d)) continue;
    const found = familyOf(d);
    if (found && FILL_ROLES.has(found.role)) return found.family;
  }
  return undefined;
}

/** Selectors filled with a colour of a family, so that what the stylesheet draws in white on them (`::after`) can follow. */
const fills = new Map();
function collectFills(css) {
  for (const { prelude, body } of blocks(css)) {
    if (prelude.startsWith('@')) {
      if (!/^@(-webkit-)?keyframes|^@font-face/.test(prelude)) collectFills(body);
      continue;
    }
    const family = fillOf(declarations(body));
    if (family) for (const selector of selectors(prelude)) fills.set(selector, family);
  }
}

/** The family a rule draws on: all its selectors are a pseudo-element (the tick of a checkbox, the dot of a radio) of a filled one. */
function drawnOn(prelude) {
  const families = selectors(prelude).map((selector) => {
    const owner = selector.replace(/::?(after|before)$/, '');
    return owner !== selector ? fills.get(owner) : undefined;
  });
  return families.every((f) => f && f === families[0]) ? families[0] : undefined;
}

/** The declarations of a rule that use a fixed colour, rewritten with the theme variables; null if none. */
function rewrite(prelude, body) {
  const list = declarations(body);
  const fill = fillOf(list);
  const onFill = fill ?? drawnOn(prelude);
  const kept = [];
  // Properties written again: the longhands after a shorthand (border-top:0 after border) must follow it, or it would undo them.
  const written = [];
  for (const d of list) {
    const colon = d.indexOf(':');
    const property = d.slice(0, colon);
    const value = d.slice(colon + 1);
    if (onFill && new RegExp(WHITE.source, 'i').test(value) && /^(color|border(-[a-z]+)*|background(-color)?)$/.test(property)) {
      // White on a strong colour of the family: the colour the theme gives for text and marks on it.
      kept.push(`${property}:${value.replace(WHITE, `var(--lc-on-${onFill})`)}`);
      written.push(property);
      continue;
    }
    if (!familyOf(value)) {
      if (written.some((shorthand) => property.startsWith(`${shorthand}-`))) kept.push(d);
      continue;
    }
    written.push(property);
    const replaced = value.replace(COLOUR, (c) => {
      const found = colours.get(c.toLowerCase());
      if (!found) return c;
      // Text in a colour of the family: its readable version on the background and surfaces of the theme.
      return property === 'color' ? `var(--lc-text-${found.family})` : VARIABLE[found.role](found.family);
    });
    kept.push(`${property}:${replaced}`);
  }
  // A filled rule without a colour of its own: the text on it would keep the white of another rule.
  if (fill && !list.some((d) => d.startsWith('color:'))) kept.push(`color:var(--lc-on-${fill})`);
  return kept.length ? kept.join(';') : null;
}

function convert(css) {
  let out = '';
  for (const { prelude, body } of blocks(css)) {
    if (prelude.startsWith('@keyframes') || prelude.startsWith('@font-face') || prelude.startsWith('@-webkit-keyframes')) continue;
    if (prelude.startsWith('@')) {
      const inner = convert(body);
      if (inner) out += `${prelude}{${inner}}`;
      continue;
    }
    const rewritten = rewrite(prelude, body);
    if (rewritten) out += `${prelude}{${rewritten}}`;
  }
  return out;
}

const version = JSON.parse(readFileSync(join(root, 'node_modules/ng-zorro-antd/package.json'), 'utf8')).version;
const original = readFileSync(source, 'utf8');
collectFills(original);
const css = convert(original);
const content = `// Generated by tools/nz-dark-theme.mjs from ng-zorro-antd ${version} (ng-zorro-antd.dark.min.css): do not edit.
// The rules of the NG-ZORRO dark stylesheet that use its fixed colours, with the colours of the platform theme instead.

/** Loaded after the NG-ZORRO dark stylesheet with dark themes (see \`provideNzThemeBridge\`). */
export const NZ_DARK_THEME_CSS = ${JSON.stringify(css)};
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing: not up to date.
  }
  if (current !== content) {
    console.error(`${target} is not up to date: run npm run nz:dark`);
    process.exit(1);
  }
  console.log('nz-dark-theme.generated.ts is up to date');
} else {
  writeFileSync(target, content);
  console.log(`Wrote ${target} (${Math.round(css.length / 1024)} kB of CSS)`);
}
