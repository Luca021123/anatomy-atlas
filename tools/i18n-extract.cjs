// Extracts every translatable English source string used by Salus (health suite) and the core shell.
// Strings come from MT.t('…') / t('…') calls, plus string values inside health/data/*.js modules
// (data files cannot call MT.t themselves; the UI translates their text at render time).
//
// Usage:
//   node tools/i18n-extract.cjs                  -> prints a summary
//   node tools/i18n-extract.cjs --json out.json  -> writes ["string", ...] (sorted, unique)
//   node tools/i18n-extract.cjs --missing es     -> lists strings with no translation in health/i18n/es.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CODE_FILES = ['assets/js/core.js', 'health/boot.js']
  .concat(fs.readdirSync(path.join(ROOT, 'health/tools')).filter(f => f.endsWith('.js')).map(f => 'health/tools/' + f));
const DATA_DIR = path.join(ROOT, 'health/data');

function unescapeJs(s, quote) {
  try { return JSON.parse('"' + s.replace(/\\'/g, "'").replace(/"/g, '\\"').replace(/\\\\"/g, '\\"') + '"'); }
  catch (e) { return s.replace(new RegExp('\\\\' + quote, 'g'), quote); }
}

function fromCode() {
  const out = new Map();
  const re = /(?:\bMT\.t|(?<![\w.$])t)\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  for (const rel of CODE_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const s = unescapeJs(m[2], m[1]);
      if (s.trim()) out.set(s, rel);
    }
  }
  return out;
}

function fromData() {
  const out = new Map();
  if (!fs.existsSync(DATA_DIR)) return out;
  for (const f of fs.readdirSync(DATA_DIR).filter(x => x.endsWith('.js'))) {
    const sandbox = { self: {}, module: { exports: {} } };
    sandbox.exports = sandbox.module.exports;
    try { vm.runInNewContext(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'), sandbox); } catch (e) { console.error('skip', f, e.message); continue; }
    const data = Object.keys(sandbox.module.exports).length ? sandbox.module.exports : sandbox.self.MTData;
    (function walk(v, key) {
      if (typeof v === 'string') {
        // Skip ids, urls, codes and other non-prose values.
        if (/^(id|key|icon|url|href|code|type|tel|ref|src|lang)$/i.test(key || '') || /^https?:/.test(v) || !/[a-z]{2}/i.test(v) || /^[\w-]+$/.test(v) && v.length < 24 && !/\s/.test(v)) return;
        out.set(v, 'health/data/' + f);
      } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
      else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], k));
    })(data, '');
  }
  return out;
}

function loadDict(lang) {
  const f = path.join(ROOT, 'health/i18n', lang + '.js');
  if (!fs.existsSync(f)) return {};
  let dict = {};
  const MT = { i18n: { add: (l, d) => { dict = Object.assign(dict, d); } } };
  vm.runInNewContext(fs.readFileSync(f, 'utf8'), { MT, self: { MT }, window: { MT } });
  return dict;
}

function fromLib() {
  // Lib files hold English rule/advice texts that tools pass through MT.t() at render time.
  const out = new Map();
  const dir = path.join(ROOT, 'health/lib');
  if (!fs.existsSync(dir)) return out;
  const re = /(['"])((?:\\.|(?!\1)[^\\\n]){4,})\1/g;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    let m;
    while ((m = re.exec(src))) {
      const s = unescapeJs(m[2], m[1]);
      // prose heuristic: has a space, starts with a letter/digit/emoji-free char, not code-like
      if (/\s/.test(s) && /[A-Za-z]{3}/.test(s) && !/^(use strict|object|function|undefined)$/.test(s) && !/[{}();=]|=>|\bvar\b|\breturn\b/.test(s) && !/^https?:/.test(s)) out.set(s, 'health/lib/' + f);
    }
  }
  return out;
}

const code = fromCode(), data = fromData(), lib = fromLib();
const all = new Map([...lib, ...data, ...code]);
const args = process.argv.slice(2);
if (args[0] === '--json') {
  fs.writeFileSync(args[1], JSON.stringify([...all.keys()].sort(), null, 1));
  console.log(`wrote ${all.size} strings to ${args[1]}`);
} else if (args[0] === '--missing') {
  const dict = loadDict(args[1]);
  const missing = [...all.keys()].filter(s => !dict[s]);
  console.log(`${args[1]}: ${all.size - missing.length}/${all.size} translated; ${missing.length} missing`);
  if (args[2] === '--list') missing.forEach(s => console.log(JSON.stringify(s)));
} else {
  const byFile = {};
  for (const [, f] of all) byFile[f] = (byFile[f] || 0) + 1;
  const words = [...all.keys()].reduce((n, s) => n + s.split(/\s+/).length, 0);
  console.log(`${all.size} unique strings (${words} words): ${code.size} from code, ${data.size} from data files, ${lib.size} from lib files`);
  Object.entries(byFile).sort().forEach(([f, n]) => console.log(`  ${f}: ${n}`));
}
