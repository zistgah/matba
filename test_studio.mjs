import assert from 'node:assert/strict';
const S = await import('./docs/js/studio.js');
let n = 0; const t = (m, f) => { f(); n++; console.log('  ok   ' + m); };

const plate = (file, o={}) => ({ file, sha256: file.padEnd(64,'0'), slug: S.slugify(file),
  title:'', subtitle:'', lead:'', explanation:'', topics:[], part:'', cover:false, ...o });
const mk = () => ({ book:{ title:'A Book', subtitle:'', repo:'you/book', author:'A', description:'' },
  plates:[ plate('cover.png',{cover:true}), plate('p1.png'), plate('p2.png') ], parts:[], config:{vendorWords:[]} });

t('slugify strips the extension and collapses junk', () => {
  assert.equal(S.slugify('The First Plate!!.png'), 'the-first-plate');
  assert.equal(S.slugify('   '), 'plate'); });
t('upload names with no meaning are flagged', () => {
  ['file_00001a.png','IMG_1234.jpg','Screenshot 2026.png','copy_of_x.png'].forEach(x =>
    assert.ok(S.needsRealName(x), x));
  assert.ok(!S.needsRealName('proclamation-of-the-dukedom.png')); });
t('duplicates collapse onto a keeper, nothing vanishes silently', () => {
  const a = plate('a.png'), b = { ...plate('b.png'), sha256: a.sha256 };
  const r = S.dedupe([a, b]);
  assert.equal(r.plates.length, 1); assert.equal(r.duplicates[0].keeper, 'a.png');
  assert.deepEqual(r.plates[0].alsoKnownAs, ['b.png']); });

t('doctor refuses an unfinished book and names each gap', () => {
  const f = S.doctor(mk());
  assert.ok(f.some(x => /No title/.test(x)) && f.some(x => /No part/.test(x)) &&
            f.some(x => /No lead/.test(x)) && f.some(x => /description/.test(x))); });
t('doctor catches a duplicate slug and a bad repo', () => {
  const s = mk(); s.plates[2].slug = s.plates[1].slug; s.book.repo = 'nope';
  const f = S.doctor(s);
  assert.ok(f.some(x => /Duplicate slug/.test(x)) && f.some(x => /owner\/name/.test(x))); });
t('doctor catches an unreplaced upload name', () => {
  const s = mk(); s.plates.push(plate('IMG_9001.png',{title:'T',part:'P',lead:'L'}));
  assert.ok(S.doctor(s).some(x => /Upload name never replaced/.test(x))); });
t('doctor catches a configured product name in any text layer', () => {
  const s = mk(); s.config.vendorWords=['acmeai']; s.plates[1].title='Made with AcmeAI';
  assert.ok(S.doctor(s).some(x => /Product name/.test(x))); });

t('the cycler asks for the lead first, plate by plate', () => {
  const s = mk(), k = S.nextTask(s);
  assert.equal(k.step.id, 'describe'); assert.equal(k.plate.file, 'p1.png'); });
t('prompts interpolate the real book, and no placeholder survives', () => {
  const s = mk(); s.book.subtitle = 'A Subtitle'; s.plates[1].lead = 'A lead already written';
  const d = S.fillPrompt(S.DEFAULT_STEPS[0], S.taskContext(s, s.plates[1]));
  assert.ok(d.includes('A Book') && d.includes('A Subtitle'));
  const e = S.fillPrompt(S.DEFAULT_STEPS[1], S.taskContext(s, s.plates[1]));
  assert.ok(e.includes('A lead already written'));
  assert.ok(!/\{(book|subtitle|lead|toc|plate)\}/.test(d + e), 'no placeholder left unfilled'); });
t('a filed answer advances to the next plate, then the next step', () => {
  const s = mk();
  S.applyAnswer(s, S.nextTask(s), 'lead one');
  assert.equal(S.nextTask(s).plate.file, 'p2.png');
  S.applyAnswer(s, S.nextTask(s), 'lead two');
  assert.equal(S.nextTask(s).step.id, 'explain'); });
t('the JSON step tolerates a fenced reply and sets the slug from the title', () => {
  const s = mk(); s.plates.forEach(p => { p.lead='L'; p.explanation='E'; });
  const k = S.nextTask(s); assert.equal(k.step.target, '@json');
  const r = S.applyAnswer(s, k, '```json\n{"title":"The Real Title","subtitle":"sub","topics":["a","b"]}\n```');
  assert.ok(r.ok); assert.equal(k.plate.title, 'The Real Title');
  assert.equal(k.plate.slug, 'the-real-title'); assert.deepEqual(k.plate.topics, ['a','b']); });
t('a bad answer is refused with a reason, never thrown at the operator', () => {
  const s = mk(); s.plates.forEach(p => { p.lead='L'; p.explanation='E'; });
  const r = S.applyAnswer(s, S.nextTask(s), 'here you go: not json at all');
  assert.equal(r.ok, false); assert.match(r.why, /JSON/); });
t('an empty answer is refused', () => {
  const s = mk(); assert.equal(S.applyAnswer(s, S.nextTask(s), '   ').ok, false); });

t('SPLIT turns one plate into several chapters sharing its image', () => {
  const s = mk(); const p = s.plates[1];
  const step = S.DEFAULT_STEPS.find(x => x.id === 'split');
  const r = S.applyAnswer(s, { step, plate: p }, JSON.stringify([
    { title:'Panel One', lead:'L1', explanation:'E1', topics:['x'] },
    { title:'Panel Two', lead:'L2', explanation:'E2' },
    { title:'Panel Three', lead:'L3', explanation:'E3' }]));
  assert.ok(r.ok); assert.equal(r.added, 2); assert.equal(s.plates.length, 5);
  assert.equal(s.plates[1].title, 'Panel One'); assert.equal(s.plates[2].title, 'Panel Two');
  assert.equal(s.plates[2].panel, 2); assert.equal(s.plates[2].derivedFrom, 'p1.png');
  assert.equal(new Set(s.plates.map(x => x.slug)).size, s.plates.length); });
t('a one-element split is a legitimate answer', () => {
  const s = mk();
  const r = S.applyAnswer(s, { step: S.DEFAULT_STEPS.find(x=>x.id==='split'), plate: s.plates[1] },
    '[{"title":"Only One","lead":"L","explanation":"E"}]');
  assert.ok(r.ok); assert.equal(r.added, 0); assert.equal(s.plates.length, 3); });

t('the abstract is asked only once every chapter is titled', () => {
  const s = mk(); s.plates.forEach(p => { p.lead='L'; p.explanation='E'; p.title='T'+Math.random(); p.part='P'; });
  const k = S.nextTask(s); assert.equal(k.step.target, '@book.description'); assert.equal(k.plate, null);
  S.applyAnswer(s, k, '<p>abstract</p>');
  assert.equal(S.nextTask(s), null); });

t('payload is kitab-shaped: parts, chapters, talking figures, doi null', () => {
  const s = mk(); s.plates.forEach((p,i) => { if(!p.cover){ p.title='T'+i; p.part='Part One'; p.lead='L'; p.explanation='E'; p.slug='t'+i; } });
  const pay = S.buildPayload(s);
  const b = pay['book.config.json'];
  assert.equal(b.meta.doi, null); assert.equal(b.meta.repo, 'you/book');
  assert.equal(b.structure.chapters.length, 2); assert.equal(b.structure.parts.length, 1);
  const f = pay.content['ch-01'].blocks.find(x => x.type === 'figure');
  assert.ok(f.explanation && f.tts === true && f.seed.enabled === true);
  assert.equal(pay['index.json'].figures.length, 2); });
t('split panels share one image file but keep separate chapters', () => {
  const s = mk();
  S.applyAnswer(s, { step: S.DEFAULT_STEPS.find(x=>x.id==='split'), plate: s.plates[1] },
    '[{"title":"A","lead":"L","explanation":"E"},{"title":"B","lead":"L","explanation":"E"}]');
  s.plates.forEach(p => { if(!p.cover){ p.part='P'; p.lead=p.lead||'L'; } });
  s.plates[3].title='C'; s.plates[3].lead='L'; s.plates[3].explanation='E';
  const pay = S.buildPayload(s);
  const srcs = Object.values(pay.content).map(c => c.blocks.find(b=>b.type==='figure').src);
  assert.equal(srcs[0], srcs[1], 'two chapters point at the same plate image');
  assert.equal(pay['index.json'].figures.length, 2, 'the shared image is listed once'); });
t('exercises travel with the chapter as a block', () => {
  const s = mk(); s.plates.forEach((p,i) => { if(!p.cover){ p.title='T'+i; p.part='P'; p.lead='L'; p.explanation='E'; p.slug='t'+i; } });
  s.plates[1].exercises = [{ kind:'mcq', q:'Q?', options:['a','b'], answer:'b' }];
  const c = S.buildPayload(s).content['ch-01'].blocks.find(b => b.type === 'exercise');
  assert.ok(c && c.items[0].answer === 'b'); });

t('crc32 known answer', () => {
  assert.equal(S.crc32(new TextEncoder().encode('123456789')), 0xCBF43926); });
t('the zip is a real zip: signature, central directory, our filenames', () => {
  const z = S.makeZip([['payload/a.json','{"a":1}'], ['payload/posters/x.png', new Uint8Array([1,2,3])]]);
  assert.equal(z[0],0x50); assert.equal(z[1],0x4b);
  const s = new TextDecoder().decode(z);
  assert.ok(s.includes('payload/a.json') && s.includes('payload/posters/x.png'));
  assert.ok(s.includes('PK\u0001\u0002') && s.includes('PK\u0005\u0006')); });
t('payloadFiles carries the project so the press can import it', () => {
  const s = mk(); s.plates.forEach((p,i) => { if(!p.cover){ p.title='T'+i; p.part='P'; p.lead='L'; p.explanation='E'; p.slug='t'+i; } });
  const names = S.payloadFiles(s, [['cover.png', new Uint8Array([1])]]).map(f => f[0]);
  assert.ok(names.includes('project.json') && names.includes('payload/book.config.json') &&
            names.includes('payload/index.json') && names.includes('payload/posters/cover.png')); });
t('an endpoint is never assumed', async () => {
  await assert.rejects(() => S.callEndpoint({}, 'p'), /No endpoint configured/); });

console.log(`\n  ===== ${n} pass, 0 fail =====`);
