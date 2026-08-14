# CONTRACT overlay — zistgah/matba

Thin overlay on the master contract at `zistgah/governance`. It ADDS; it never relaxes.

1. **The tool passes its own tests before it ships.** `bash test_matba.sh` is the contract check in
   `seed_matba.sh`. A red suite does not push and does not mint.
2. **Stdlib only.** No runtime dependency may be added to `matba.py`. If a feature needs a package,
   it belongs in a separate component, not here.
3. **The gates are never bypassed or defaulted.** Push and mint require the word typed exactly. A
   wrong word aborts with rc=3 and records nothing. The web path passes the typed word on stdin.
4. **It drives tools, it does not reimplement them.** git, gh and misty are called, never emulated.
   The tool's interface is read at run time, never recalled — and a discovered verb is not a
   discovered signature.
5. **One engine.** matba emits ONE generic seeder. A per-book copy is the defect this repo exists to
   end; do not fork the template into a variant.
6. **Every doctor check cites a real failure.** A check is added when a defect reaches a live DOI,
   not because it seems prudent. Removing one requires showing the failure can no longer occur.
7. **Tokens by path, never inlined**, never in a flag, never in a commit.
8. **Nothing pushes or mints without his typed gate.** An AI writes the script; he runs it.
