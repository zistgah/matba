/* exercises.js — the `exercise` block type for kitab.
 *
 * Marked in the reader, in the browser, with no server and no account. Multiple choice and
 * fill-in-the-blank are marked here; long answers are handed off to whichever AI the reader uses,
 * by the same copy-and-paste cycle as the composing room. Completion is recorded the way the book
 * is configured — a pre-filled issue, or a callback you name — never by us, and never silently.
 */
export const norm = s => String(s == null ? '' : s).trim().toLowerCase()
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/[.,;:!?]+$/, '').replace(/\s+/g, ' ');

/** Marks one item. Long answers are never auto-marked: they return 'handoff'. */
export function mark(item, given) {
  if (item.kind === 'long') return { verdict: 'handoff', correct: null };
  if (item.kind === 'mcq') {
    const ok = norm(given) === norm(item.answer);
    return { verdict: ok ? 'right' : 'wrong', correct: item.answer };
  }
  if (item.kind === 'cloze') {
    const accept = [item.answer, ...(item.also || [])].map(norm);
    return { verdict: accept.includes(norm(given)) ? 'right' : 'wrong', correct: item.answer };
  }
  return { verdict: 'unknown', correct: null };
}

export function score(items, answers) {
  let asked = 0, right = 0, handoff = 0;
  items.forEach((it, i) => {
    const r = mark(it, answers[i]);
    if (r.verdict === 'handoff') { handoff++; return; }
    asked++; if (r.verdict === 'right') right++;
  });
  return { asked, right, handoff, pct: asked ? Math.round(right * 100 / asked) : 0 };
}

/** A timed run. Returns remaining seconds; the caller decides what to do at zero. */
export function timer(seconds, onTick, onEnd) {
  let left = seconds, h = setInterval(() => {
    left--; onTick(left);
    if (left <= 0) { clearInterval(h); onEnd(); }
  }, 1000);
  return () => clearInterval(h);
}

export function longAnswerPrompt(item, given, book) {
  return `You are marking one long answer from "${book}". Mark it against the question only.

Question:
${item.q}

${item.rubric ? 'Rubric:\n' + item.rubric + '\n' : ''}Answer given:
${given}

Reply with ONLY this JSON:
{"verdict":"right|partial|wrong","why":"one sentence","missing":["…"]}`;
}

/** The certificate is a claim about a run, hashable and stampable. It asserts nothing else. */
export async function certificate(state) {
  const body = {
    protocol: 'matba/certificate/v1',
    book: state.book, doi: state.doi || null, repo: state.repo || null,
    chapter: state.chapter || null,
    asked: state.asked, right: state.right, pct: state.pct,
    handoff: state.handoff || 0,
    started: state.started, finished: state.finished,
    proctored: !!state.proctored,
    name: state.name || null
  };
  const text = JSON.stringify(body);
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const sha = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  return { body, text, sha256: sha,
    note: 'This records a self-marked run in a browser. It is evidence of the run, not of identity. ' +
          'Timestamp it to fix when it happened; that is what makes it checkable.' };
}

/** Where completion goes is configuration. Nothing is posted anywhere by default. */
export function recordUrl(cfg, cert) {
  if (!cfg || !cfg.mode || cfg.mode === 'none') return null;
  if (cfg.mode === 'issue') {
    if (!cfg.repo) return null;
    const title = `[completion] ${cert.body.chapter || cert.body.book} — ${cert.body.pct}%`;
    const body = ['```json', cert.text, '```', '', 'sha256: `' + cert.sha256 + '`'].join('\n');
    return `${(cfg.forge || 'https://github.com').replace(/\/+$/, '')}/${cfg.repo}/issues/new` +
      `?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}` +
      (cfg.label ? `&labels=${encodeURIComponent(cfg.label)}` : '');
  }
  if (cfg.mode === 'callback' && cfg.url) return cfg.url;
  return null;
}
