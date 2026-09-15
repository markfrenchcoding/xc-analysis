// node pull/test_crawl.js
//
// The scheduled crawl's one important decision: may a run nobody watched
// overwrite the database? Everything else it does is network, but this is pure,
// and it is the part where being wrong is expensive — a refusal costs a week of
// staleness, a wrong write puts a broken board in front of readers.
//
// The rule is lifted out of crawl.js by text rather than re-stated here, so the
// test cannot quietly drift away from the code. If crawl.js changes shape this
// fails loudly instead of passing against a stale copy.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'crawl.js'), 'utf8');
const m = src.match(/let bad = '';([\s\S]*?)if \(bad\)/);
if (!m) {
  console.log('FAIL: the guard block in crawl.js is not where this test expects it');
  process.exit(1);
}
// eslint-disable-next-line no-new-func
const decide = new Function('S', 'counters', 'b', 'wasRows',
  "let bad='';" + m[1] + 'return bad;');

let pass = 0, fail = 0;
const t = (label, got, want) => {
  const ok = want ? got.includes(want) : got === '';
  if (ok) pass++; else { fail++; console.log('  FAIL  ' + label + ' -> ' + JSON.stringify(got)); }
};

const S = failed => ({ failed: failed || [] });
const C = (read, empty) => ({ read, empty });
const B = rows => ({ rows });
const WAS = 2974;

// the happy path, and the three refusals
t('a clean run writes',            decide(S(),    C(120, 6),  B(3645), WAS), '');
t('a meet that never answered',    decide(S([1]), C(120, 6),  B(3645), WAS), 'never answered');
t('most races came back empty',    decide(S(),    C(120, 80), B(3645), WAS), 'came back empty');
t('the seed collapsed',            decide(S(),    C(120, 6),  B(2000), WAS), 'shrank');

// and the edges, which are where a guard is usually wrong
t('too few races to judge empties', decide(S(),   C(10, 9),   B(3645), WAS), '');
t('a bigger seed is fine',          decide(S(),   C(120, 6),  B(4000), WAS), '');
t('a 2% dip is within tolerance',   decide(S(),   C(120, 6),  B(2900), WAS), '');
t('an 11% dip is not',              decide(S(),   C(120, 6),  B(2646), WAS), 'shrank');

console.log(pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
