import assert from 'node:assert/strict';
const E = await import('./docs/js/exercises.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('  ok   ' + m); };

t('multiple choice marks exactly, tolerating case and stray punctuation', () => {
  const it = { kind:'mcq', q:'?', options:['a','B two'], answer:'B two' };
  assert.equal(E.mark(it, 'b two').verdict, 'right');
  assert.equal(E.mark(it, 'B two.').verdict, 'right');
  assert.equal(E.mark(it, 'a').verdict, 'wrong');
  assert.equal(E.mark(it, '').verdict, 'wrong'); });
t('fill-in accepts the alternatives the author declared', () => {
  const it = { kind:'cloze', q:'__', answer:'executable intent', also:['an executable intent'] };
  assert.equal(E.mark(it, 'Executable  Intent').verdict, 'right');
  assert.equal(E.mark(it, 'an executable intent').verdict, 'right');
  assert.equal(E.mark(it, 'intent').verdict, 'wrong'); });
t('a long answer is NEVER auto-marked', () => {
  const r = E.mark({ kind:'long', q:'Discuss.' }, 'anything at all');
  assert.equal(r.verdict, 'handoff'); assert.equal(r.correct, null); });
t('scoring counts only what was marked here', () => {
  const items = [{kind:'mcq',answer:'a',options:['a','b']},{kind:'cloze',answer:'x'},{kind:'long'}];
  const s = E.score(items, ['a','y','essay']);
  assert.deepEqual([s.asked, s.right, s.handoff, s.pct], [2, 1, 1, 50]); });
t('the long-answer prompt carries the question and rubric, not the marking', () => {
  const p = E.longAnswerPrompt({ q:'Q here', rubric:'R here' }, 'my answer', 'A Book');
  assert.ok(p.includes('Q here') && p.includes('R here') && p.includes('my answer') && p.includes('A Book'));
  assert.ok(p.includes('"verdict"')); });
t('the certificate hashes its own claim and does not overclaim', async () => {
  const c = await E.certificate({ book:'B', asked:2, right:2, pct:100, started:'t0', finished:'t1' });
  assert.match(c.sha256, /^[0-9a-f]{64}$/);
  const again = await E.certificate({ book:'B', asked:2, right:2, pct:100, started:'t0', finished:'t1' });
  assert.equal(c.sha256, again.sha256, 'same run, same hash');
  assert.match(c.note, /not of identity/); });
t('completion goes nowhere unless configured', () => {
  assert.equal(E.recordUrl(null, {}), null);
  assert.equal(E.recordUrl({ mode:'none' }, {}), null);
  assert.equal(E.recordUrl({ mode:'issue' }, {}), null, 'issue mode with no repo posts nowhere'); });
t('issue mode builds a pre-filled issue at the configured repo, nothing hardcoded', async () => {
  const c = await E.certificate({ book:'B', chapter:'ch-01', asked:1, right:1, pct:100 });
  const u = new URL(E.recordUrl({ mode:'issue', repo:'you/book', label:'completion' }, c));
  assert.equal(u.origin + u.pathname, 'https://github.com/you/book/issues/new');
  assert.ok(u.searchParams.get('body').includes(c.sha256));
  const alt = new URL(E.recordUrl({ mode:'issue', repo:'me/other', forge:'https://forge.example' }, c));
  assert.equal(alt.origin, 'https://forge.example'); });
console.log(`\n  ===== ${n} pass, 0 fail =====`);
