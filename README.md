# matba (مطبع) — the press


[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21948734.svg)](https://doi.org/10.5281/zenodo.21948734)

One tool for the whole path: **posters in → book out, sealed, pushed, minted.**
Local-first, single file, **stdlib only**. No install, no dependencies, no backend.

```bash
python3 matba.py serve            # web UI on http://127.0.0.1:8710
```

The CLI mirrors every web action, so anything you can click you can script:

```bash
python3 matba.py new geometry --title "The Geometry of X" --repo zistgah/geometry
python3 matba.py intake geometry ~/plates
python3 matba.py bulk   geometry plates.tsv     # file ⇥ title ⇥ subtitle ⇥ part ⇥ topics ⇥ lead ⇥ explanation
python3 matba.py set    geometry cover.png --cover
python3 matba.py doctor geometry                # exits 1 on any failure
python3 matba.py build  geometry                # payload + seeder + tarball
python3 matba.py run    geometry stage          # nothing upstream
python3 matba.py run    geometry push
python3 matba.py run    geometry mint --override-rehearsal
```

## What it actually does

It does **not** reimplement git, gh or misty. It writes **one generic seeder** — the same engine
that minted `zenodo.21917807`, `.21928710` and `.21930508` — parameterised for your book, and
drives it. That kills the copy-per-book problem: the engine now exists once.

`MATBA_HOME` (default `./matba-projects`) holds one directory per book: `project.json`, the
posters you brought, the generated `payload/`, the generated `seed_<slug>.sh`, the tarball, and a
`work/` directory where runs happen. Nothing is written outside it.

## The gates are unchanged

Nothing pushes or mints without the word typed. In the web UI you type it into the prompt and it is
passed to the gate on stdin — never bypassed, never defaulted. A wrong word aborts with `rc=3` and
nothing is recorded. The mint button additionally requires a confirmation, because mint is permanent.

## Doctor

Every check exists because that failure once reached a live DOI:

| check | the failure it prevents |
|---|---|
| duplicate bytes | the same plate minted twice under two names |
| duplicate slug | one chapter silently overwriting another |
| missing cover / cover-is-also-a-chapter | a jacket counted as content |
| undeclared file in `assets/figures` | kitab's Lorem-Ipsum placeholders reaching Zenodo |
| stale book name in the seeder | a derived book still announcing its parent |
| empty description | a Zenodo record with a blank abstract |
| vendor name in a text layer | a trademark in a permanent title |

## Four defects fixed here, found in the paradox and duke2 runs

1. **Stale book name** — the sed-derived seeders still said `+ dukedom data`. The generic engine is
   parameterised, so there is nothing to leak.
2. **Mangled mint banner** — `REVIEW.md defects REVIEW.md is open.` Now generated, not substituted.
3. **`--mint` re-ran the PUSH gate** and pushed again, producing four commits where two were
   wanted. A no-op push is now detected and skipped: *nothing changed and origin already matches*.
4. **`misty ots stamp` warned on an already-stamped receipt.** Now skipped with `already stamped`,
   because a pending OTS attestation cannot be re-stamped and that is not a failure.

## Colab

`matba.ipynb` runs the same engine with no local server — mount Drive, drop posters in a folder,
fill the plate table in a form cell, build, then push and mint with your own tokens. Same gates,
typed into the notebook.

## Self-test

`bash test_matba.sh` — offline, against a stubbed forge, misty and kitab template. Proves the
absent remote is created and verified, staging writes nothing upstream, template placeholders are
swept, a second push is a genuine no-op, a wrong gate word aborts and records nothing, the gate
still bites when three wrong lines precede the right one, the DOI is parsed from misty's own
result and recorded back into both files, and the manifest verifies after the reseal.

## The composing room — static, no install

`docs/studio.html` is the whole authoring path as one static page. It works from GitHub Pages, from
matba's local server at `/studio`, or inside an iframe on any site. Nothing is uploaded and no
account or key is needed.

- **Load and sort.** Drop images or a folder. Each is hashed in the tab; identical bytes collapse
  onto one keeper that says *same bytes as …* rather than vanishing. Sort by name, group by part,
  reorder, pick the cover, or paste a table.
- **The cycler.** Copy a prompt, paste it into whichever AI you use with the plate, copy the answer,
  and press **Apply and copy next** — one button files the answer and puts the following prompt on
  your clipboard. Five steps: lead, explanation, title-and-topics as JSON, and the book abstract
  once every chapter is titled. Prompts are data, so you can change them.
- **Poster → chapters.** A plate carrying several panels splits into several chapters that share the
  one image. The array comes back as JSON; a one-element array is a legitimate answer.
- **Or call an endpoint.** Optional, and nothing is configured: you supply the URL, your key, the
  request shape and where the reply lives. No provider is named or suggested anywhere.
- **Exercises.** Multiple choice, fill-in-the-blank and long answers attach to a chapter and travel
  with the book.
- **Export.** A payload zip, written by a dependency-free zip writer and verified against Python's
  `zipfile`. Bring it into a project with `matba import <slug> payload.zip`.

## Exercises in the book

`docs/js/exercises.js` is the `exercise` block for kitab. Multiple choice and fill-in-the-blank are
marked in the reader with no server; **long answers are never auto-marked** — they hand off to your
AI with the question and rubric. Timed runs are supported, and a run produces a certificate that
hashes its own claim and says plainly what it is: evidence of the run, not of identity. Where
completion goes is configuration — a pre-filled issue at a repository you name, a callback you name,
or nowhere, which is the default.

## Seeding and minting matba itself

matba is a tool, not a book, so it has its own seeder. Put `seed_matba.sh` beside `matba.tar`:

```bash
bash seed_matba.sh          # stage — nothing upstream
bash seed_matba.sh --push   # gh repo create -> SELFTEST -> seal -> push -> verify -> Pages(/docs)
bash seed_matba.sh --mint --override-rehearsal
```

**The contract check is running the test suite.** A tool that cannot pass its own tests does not
get pushed and certainly does not get a DOI. It also asserts `matba.py` parses, the notebook is a
valid notebook, the metadata parses, and — enforcing CONTRACT clause 2 — that **every import is
stdlib**. Proven to bite: a syntax error in `matba.py` and a single forced test failure each abort
before anything reaches the forge.

Gate words are `PUSH matba` and `MINT matba`. On mint the DOI is recorded back into
`metadata/misty.json`, `CITATION.cff`, the README badge **and** the regenerated `docs/index.html`.

Pages serves from `/docs`, and the push prints the line that matters for the notebook:
`https://raw.githubusercontent.com/zistgah/matba/main/matba.py` resolves once this is pushed, which
is what makes cell 1 of the Colab notebook work for anyone else.
