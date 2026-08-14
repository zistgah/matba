# CONTEXT — zistgah/matba

**What this is.** A single-file local application (`matba.py`) with a web UI, a CLI and a Colab
notebook, automating the whole path from a folder of posters to a pushed, sealed, minted book.

**Why it exists.** Three books were seeded by three near-identical scripts derived from one another
by `sed` (zenodo.21917807, .21928710, .21930508). Each copy inherited the previous one's defects and
added a stale string of its own. matba emits ONE generic seeder, parameterised per book, so the
engine exists once.

**What it drives.** `git`, `gh`, `misty` (misty-doi) and the `zistgah/kitab` book template. It
reimplements none of them.

**Layout.** `matba.py` (app + engine + CLI) · `matba.ipynb` (Colab) · `test_matba.sh` (offline
suite, stubs the forge, misty and the template) · `docs/index.html` (Pages landing).
`MATBA_HOME` holds one directory per book and nothing is written outside it.

**Doctor checks and where they came from.** Duplicate bytes, duplicate slug, missing cover,
cover-is-also-a-chapter, undeclared file in `assets/figures` (kitab's Lorem-Ipsum placeholders
reached zenodo.21917807), stale book name in the generated seeder, empty description, vendor name in
a text layer.

**Known limits, stated rather than hidden.** The web UI polls the log rather than streaming it.
There is no headless-browser test, so the page is verified by API assertions and a DOM-contract
check, not by clicking. Colab VMs are ephemeral — put `MATBA_HOME` on Drive to keep projects.
