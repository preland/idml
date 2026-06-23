// Ad-hoc grammar check: tokenize sample .isdw lines and print the scopes so we
// can eyeball that each token gets a sensible TextMate scope. Run from the
// extension dir: `node scripts/tokenize-check.mjs`
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import onigPkg from 'vscode-oniguruma';
import vsctmPkg from 'vscode-textmate';
const oniguruma = onigPkg.loadWASM ? onigPkg : onigPkg.default;
const vsctm = vsctmPkg.Registry ? vsctmPkg : vsctmPkg.default;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

const wasmBin = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => ({
  createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
  createOnigString: (s) => new oniguruma.OnigString(s),
}));

const registry = new vsctm.Registry({
  onigLib: vscodeOnigurumaLib,
  loadGrammar: async () =>
    vsctm.parseRawGrammar(
      readFileSync(join(root, 'syntaxes/isdw.tmLanguage.json'), 'utf8'),
      'isdw.tmLanguage.json'
    ),
});

const sample = [
  '# header comment',
  './test/users[scroll]',
  'NavLink:Button `flex items-center text-gray-800`',
  'import NavLink, NavBtn from "./styles.isdw"',
  'define TopBar(title) {',
  '  Text(@buildSha)[auto,100,center-left]`text-xs`{}',
  '  Button("Save", saveUser)[20,10,top-right]<bg=#1a56db pad=2>{}',
  '  Input(~email)[auto,100,top-left]{}',
  '  Icon("ChatDots", 24, "white")[auto,auto,center]{}',
  '}',
];

const grammar = await registry.loadGrammar('source.isdw');
let ruleStack = vsctm.INITIAL;
for (const line of sample) {
  const r = grammar.tokenizeLine(line, ruleStack);
  console.log('\n' + line);
  for (const t of r.tokens) {
    const text = line.substring(t.startIndex, t.endIndex);
    if (!text.trim()) continue;
    const scope = t.scopes[t.scopes.length - 1];
    console.log(`   ${JSON.stringify(text).padEnd(22)} ${scope}`);
  }
  ruleStack = r.ruleStack;
}
