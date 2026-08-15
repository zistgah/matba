/* studio.js — the composing room.
 *
 * Everything here runs in the browser with no backend: on GitHub Pages, in an iframe, or from
 * matba's local server. Pure functions are exported so node can test the shipped code.
 *
 * Three jobs:
 *   1. INTAKE + SORT   drop plates, hash once, collapse duplicates, name, part, pick the cover
 *   2. THE CYCLER      copy a prompt out to any AI, paste the answer back, one click advances
 *   3. EXPORT          a payload zip matba can import, written without a zip dependency
 *
 * No vendor is named anywhere. Endpoints, prompts and steps are configuration.
 */

/* ── hashing ─────────────────────────────────────────────────────────────── */
export async function sha256(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-') || 'plate';
}

/* Upload names that carry no meaning and should be replaced before publication. */
export function needsRealName(name) {
  return /^(file_[0-9a-f]{6,}|IMG[_-]?\d+|DSC\d+|Screenshot|image|photo|untitled|copy[_ ]of)/i
    .test(name.replace(/\.[a-z0-9]+$/i, ''));
}

/* Duplicates collapse onto a keeper rather than vanishing, so nothing is silently lost. */
export function dedupe(plates) {
  const byHash = new Map(), out = [], dups = [];
  for (const p of plates) {
    const k = byHash.get(p.sha256);
    if (k) { dups.push({ dropped: p.file, keeper: k.file }); k.alsoKnownAs = (k.alsoKnownAs || []).concat(p.file); }
    else { byHash.set(p.sha256, p); out.push(p); }
  }
  return { plates: out, duplicates: dups };
}

/* ── the doctor — the same eight checks the press enforces, run before you leave the page ── */
export function doctor(state) {
  const f = [], ch = state.plates.filter(p => !p.cover), cov = state.plates.filter(p => p.cover);
  if (!state.plates.length) f.push('No plates yet. Drop a folder of images, or a zip.');
  if (!cov.length) f.push('No cover chosen. Click the disc on the plate that is the jacket.');
  if (cov.length > 1) f.push('More than one cover.');
  for (const p of ch) {
    if (!p.title) f.push('No title: ' + p.file);
    if (!p.part) f.push('No part: ' + p.file);
    if (!p.lead) f.push('No lead paragraph: ' + p.file);
    if (needsRealName(p.file) && p.slug === slugify(p.file))
      f.push('Upload name never replaced: ' + p.file);
  }
  const s = state.plates.map(p => p.slug);
  new Set(s.filter(x => s.filter(y => y === x).length > 1)).forEach(x => f.push('Duplicate slug: ' + x));
  if (!state.book.title) f.push('No book title.');
  if (!state.book.description) f.push('No description. A deposit with a blank abstract is permanent too.');
  if (!/^[^/\s]+\/[^/\s]+$/.test(state.book.repo || '')) f.push('Repository must be owner/name.');
  const blob = JSON.stringify(state).toLowerCase();
  for (const v of (state.config?.vendorWords || []))
    if (blob.includes(v)) f.push('Product name in a text layer: ' + v);
  return f;
}

/* ── the cycler ──────────────────────────────────────────────────────────────
 * Steps are DATA. Copy the prompt out to whichever AI you use, paste the answer back, and one
 * click applies it and copies the next prompt. Nothing is sent anywhere unless you configure an
 * endpoint and supply your own key.
 */
export const DEFAULT_STEPS = [
  {
    id: 'describe',
    title: 'Read the plate',
    target: 'lead',
    needs: ['image'],
    prompt:
`Read the attached plate from "{book}"{subtitle} and write ONE paragraph of 60–110 words that a
reader meets before they see it. State what the plate contains, in its own vocabulary. Do not
praise it, do not summarise its significance, and do not introduce a term the plate does not use.

Reply with the paragraph only — no heading, no quotation marks.`
  },
  {
    id: 'explain',
    title: 'Say what to look at',
    target: 'explanation',
    needs: ['image', 'lead'],
    prompt:
`For the same plate, write ONE paragraph of 60–110 words naming the single panel or claim a reader
should look at first, and why it is load-bearing rather than decorative. Preserve any hedging the
plate itself uses: if it says hypothesis or correlation, keep that word.

Lead paragraph already written:
{lead}

Reply with the paragraph only.`
  },
  {
    id: 'title',
    title: 'Title and topics',
    target: '@json',
    needs: ['image'],
    prompt:
`For the same plate, reply with ONLY this JSON and nothing else:

{"title":"…","subtitle":"…","topics":["…","…","…"]}

title: how a table of contents would name it — under 60 characters, no colon-subtitle.
subtitle: one clause, under 100 characters.
topics: 4–6 lowercase index terms drawn from the plate's own vocabulary.`
  },
  {
    id: 'split',
    title: 'Split into chapters',
    target: '@chapters',
    needs: ['image'],
    optional: true,
    prompt:
`This plate carries several distinct panels that should become separate chapters.

Reply with ONLY a JSON array, one object per chapter, in reading order:

[{"title":"…","subtitle":"…","lead":"…","explanation":"…","topics":["…"]}]

lead: 60–110 words, what the panel contains.
explanation: 60–110 words, what to look at and why.
Use the plate's own vocabulary. If it really is one chapter, return an array of length 1.`
  },
  {
    id: 'abstract',
    title: 'Book abstract',
    target: '@book.description',
    needs: ['toc'],
    once: true,
    prompt:
`Write the deposit abstract for a book titled "{book}"{subtitle}, as 2–3 HTML paragraphs wrapped in
<p> tags. It must state what the work contains and what its primitives mean, not why it matters.
Preserve any hedging in the source. No marketing language, no first person.

Contents:
{toc}

Reply with the HTML only.`
  }
];

export function fillPrompt(step, ctx) {
  return step.prompt.replace(/\{(\w+(?:\.\w+)?)\}/g, (_, k) => {
    const v = k.split('.').reduce((o, x) => (o == null ? o : o[x]), ctx);
    return v == null ? '' : String(v);
  }).trim();
}

/* Which plate and step the cycler is on, given what is already filled in. */
export function nextTask(state, steps = DEFAULT_STEPS) {
  const ch = state.plates.filter(p => !p.cover);
  for (const step of steps) {
    if (step.optional) continue;
    if (step.once) {
      if (step.target === '@book.description' && !state.book.description && ch.length &&
          ch.every(p => p.title)) return { step, plate: null };
      continue;
    }
    for (const p of ch) {
      if (step.target === '@json') { if (!p.title) return { step, plate: p }; }
      else if (!p[step.target]) return { step, plate: p };
    }
  }
  return null;
}

export function taskContext(state, plate) {
  const ch = state.plates.filter(p => !p.cover);
  return {
    book: state.book.title || 'this book',
    subtitle: state.book.subtitle ? ' — ' + state.book.subtitle : '',
    plate: plate ? (plate.title || plate.file) : '',
    lead: plate ? (plate.lead || '') : '',
    toc: ch.map((p, i) => `${i + 1}. ${p.title || p.file}${p.subtitle ? ' — ' + p.subtitle : ''}`).join('\n')
  };
}

/* Apply an answer. Returns {ok, added} or {ok:false, why} — never throws at the operator. */
export function applyAnswer(state, task, text) {
  const t = (text || '').trim();
  if (!t) return { ok: false, why: 'Nothing to apply — the answer is empty.' };
  const { step, plate } = task;

  const parse = () => {
    let s = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const a = s.indexOf('['), o = s.indexOf('{');
    const i = (a !== -1 && (o === -1 || a < o)) ? a : o;
    if (i > 0) s = s.slice(i);
    const j = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
    if (j !== -1) s = s.slice(0, j + 1);
    return JSON.parse(s);
  };

  if (step.target === '@json') {
    let o; try { o = parse(); } catch (e) { return { ok: false, why: 'That is not JSON. Paste the JSON object only.' }; }
    if (Array.isArray(o)) o = o[0];
    if (!o || !o.title) return { ok: false, why: 'The JSON has no "title".' };
    plate.title = String(o.title).trim();
    if (o.subtitle) plate.subtitle = String(o.subtitle).trim();
    if (Array.isArray(o.topics)) plate.topics = o.topics.map(String);
    if (!plate.slug || plate.slug === slugify(plate.file)) plate.slug = slugify(plate.title);
    return { ok: true, added: 0 };
  }

  if (step.target === '@chapters') {
    let arr; try { arr = parse(); } catch (e) { return { ok: false, why: 'That is not JSON. Paste the array only.' }; }
    if (!Array.isArray(arr)) arr = [arr];
    if (!arr.length || !arr[0].title) return { ok: false, why: 'The array is empty or has no "title".' };
    const at = state.plates.indexOf(plate), made = [];
    const image = slugify(plate.file);        // every panel reads the same plate image
    arr.forEach((c, i) => {
      const p = i === 0 ? plate : { ...plate, alsoKnownAs: undefined, derivedFrom: plate.file };
      p.imageName = image;
      p.title = String(c.title).trim();
      p.subtitle = c.subtitle ? String(c.subtitle).trim() : '';
      p.lead = c.lead ? String(c.lead).trim() : '';
      p.explanation = c.explanation ? String(c.explanation).trim() : '';
      p.topics = Array.isArray(c.topics) ? c.topics.map(String) : [];
      p.slug = slugify(p.title);
      if (i > 0) { p.panel = i + 1; made.push(p); }
    });
    // Several chapters can share one plate image; each still needs its own slug.
    made.forEach((p, i) => state.plates.splice(at + 1 + i, 0, p));
    return { ok: true, added: made.length };
  }

  if (step.target === '@book.description') { state.book.description = t; return { ok: true, added: 0 }; }
  plate[step.target] = t;
  return { ok: true, added: 0 };
}

/* Optional direct call. Endpoint and key are the operator's; nothing ships configured. */
export async function callEndpoint(cfg, prompt, imageB64) {
  if (!cfg || !cfg.url) throw new Error('No endpoint configured. Use copy-and-paste, or set one in Settings.');
  const body = JSON.parse((cfg.bodyTemplate || '{"prompt":"{prompt}"}')
    .replace('"{prompt}"', JSON.stringify(prompt))
    .replace('"{image}"', JSON.stringify(imageB64 || '')));
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' },
      cfg.key ? JSON.parse((cfg.headerTemplate || '{"authorization":"Bearer {key}"}').replace('{key}', cfg.key)) : {})
    , body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Endpoint returned ' + r.status + '. Copy-and-paste still works.');
  const j = await r.json();
  const path = (cfg.replyPath || 'text').split('.');
  const v = path.reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? Number(k) : k]), j);
  if (typeof v !== 'string') throw new Error('Could not find the reply at "' + (cfg.replyPath || 'text') + '".');
  return v;
}

/* ── payload ─────────────────────────────────────────────────────────────── */
export function buildPayload(state) {
  const ch = state.plates.filter(p => !p.cover);
  const cov = state.plates.find(p => p.cover);
  const order = [];
  for (const part of state.parts.length ? state.parts : [...new Set(ch.map(p => p.part))].map(t => ({ id: slugify(t), title: t }))) {
    const members = ch.filter(p => slugify(p.part) === part.id || p.part === part.title);
    if (members.length) order.push({ part, members });
  }
  const placed = new Set(order.flatMap(o => o.members));
  const left = ch.filter(p => !placed.has(p));
  if (left.length) order.push({ part: { id: 'other', title: 'Other' }, members: left });

  const chapters = [], parts = [], content = {}, figures = [];
  let n = 0;
  for (const { part, members } of order) {
    const ids = [];
    for (const p of members) {
      n++; const cid = 'ch-' + String(n).padStart(2, '0');
      const src = 'assets/figures/' + (p.imageName || p.slug) + '.png';
      content[cid] = {
        id: cid, title: p.title, subtitle: p.subtitle || '',
        blocks: [
          { type: 'paragraph', text: p.lead },
          { type: 'figure', id: p.slug, dimension: '2d', src, alt: p.title,
            caption: p.subtitle ? p.title + ' — ' + p.subtitle : p.title,
            explanation: p.explanation || p.lead, tts: true,
            seed: { enabled: true, prompt: (state.book.seedPrompt || '').replace('{plate}', p.title) } },
          ...(state.book.plateNote ? [{ type: 'callout', variant: 'note', text: state.book.plateNote }] : []),
          ...(p.exercises && p.exercises.length ? [{ type: 'exercise', id: cid + '-ex', items: p.exercises }] : [])
        ]
      };
      chapters.push({ id: cid, number: n, title: p.title, subtitle: p.subtitle || '',
                      source: 'content/' + cid + '.json', topics: p.topics || [] });
      const fname = (p.imageName || p.slug) + '.png';
      if (!figures.some(f => f.file === 'posters/' + fname))
        figures.push({ chapter: cid, slug: p.slug, title: p.title,
                       file: 'posters/' + fname, sha256: p.sha256 });
      ids.push(p.slug);
    }
    parts.push({ id: part.id, title: part.title, chapters: ids });
  }
  const b = state.book;
  return {
    'book.config.json': {
      meta: { title: b.title, subtitle: b.subtitle || '', author: b.author, affiliation: b.affiliation,
              orcid: b.orcid, copyright: `Copyright (c) ${b.copyrightYears || '1993-2026'} ${b.author}. All rights reserved.`,
              license: b.license || 'CC-BY-SA-4.0', doi: null, repo: b.repo,
              cover: 'assets/figures/cover.png', language: 'en' },
      theme: { tokens: b.tokens || { '--ink': '#0a0e27', '--acc': '#d4a843', '--light': '#fbf6e9' } },
      structure: { parts, chapters }
    },
    'index.json': { generator: 'matba studio', book: b.title,
                    cover: { file: 'posters/cover.png', sha256: cov ? cov.sha256 : null }, figures },
    content, chapterCount: chapters.length
  };
}

/* ── zip writer, STORE + CRC32. No dependency, deterministic stamp. ───────── */
const CRC = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
export function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const u16 = v => [v & 255, (v >> 8) & 255];
  const u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const [name, data] of files) {
    const nb = enc.encode(name);
    const d = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
    const c = crc32(d);
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length),
      ...u16(nb.length), ...u16(0), ...nb]);
    parts.push(local, d);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length),
      ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nb]));
    off += local.length + d.length;
  }
  const cd = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length), ...u32(cd), ...u32(off), ...u16(0)]);
  const total = off + cd + end.length, out = new Uint8Array(total);
  let i = 0; for (const p of [...parts, ...central, end]) { out.set(p, i); i += p.length; }
  return out;
}

export function payloadFiles(state, images) {
  const pay = buildPayload(state), files = [];
  files.push(['payload/book.config.json', JSON.stringify(pay['book.config.json'], null, 2) + '\n']);
  files.push(['payload/index.json', JSON.stringify(pay['index.json'], null, 2) + '\n']);
  for (const [cid, doc] of Object.entries(pay.content))
    files.push(['payload/content/' + cid + '.json', JSON.stringify(doc, null, 2) + '\n']);
  for (const [name, bytes] of images) files.push(['payload/posters/' + name, bytes]);
  files.push(['project.json', JSON.stringify({
    slug: (state.book.repo || '/').split('/')[1] || 'book', title: state.book.title,
    subtitle: state.book.subtitle || '', repo: state.book.repo, author: state.book.author,
    affiliation: state.book.affiliation, orcid: state.book.orcid, license: state.book.license,
    description: state.book.description, keywords: state.book.keywords || [],
    related: state.book.related || [], plate_note: state.book.plateNote || '',
    parts: state.parts, plates: state.plates.map(p => ({
      file: p.file, sha256: p.sha256, slug: p.slug, title: p.title || '', subtitle: p.subtitle || '',
      lead: p.lead || '', explanation: p.explanation || '', topics: p.topics || [],
      part: p.part || '', cover: !!p.cover, exercises: p.exercises || [],
      imageName: p.imageName || undefined, panel: p.panel || undefined }))
  }, null, 2) + '\n']);
  return files;
}
