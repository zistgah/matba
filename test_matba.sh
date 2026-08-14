#!/usr/bin/env bash
# Offline. Proves the app end-to-end against a stubbed forge, misty and kitab.
set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P=0;F=0; ok(){ P=$((P+1)); echo "  ok   $1"; }; bad(){ F=$((F+1)); echo "  FAIL $1"; }
W="$(mktemp -d "$PWD/mt.XXXXXX")"; trap 'rm -rf "$W"' EXIT; cd "$W"
export MATBA_HOME="$W/projects"; export WORK="$W"; mkdir -p bin plates forge/zistgah
export PATH="$W/bin:$PATH"
git config --global user.email t@t >/dev/null 2>&1||true; git config --global user.name t >/dev/null 2>&1||true
git config --global init.defaultBranch main >/dev/null 2>&1||true

cat > bin/gh <<'GH'
#!/usr/bin/env bash
F="$WORK/forge"
case "$1 $2" in
 "repo view") [ -d "$F/$3.git" ] && exit 0 || exit 1;;
 "repo create") mkdir -p "$F/$3.git" && git init -q --bare "$F/$3.git" && echo created; exit 0;;
 "repo clone") git clone -q "$F/$3.git" "$4" 2>/dev/null; exit $?;;
esac
[ "$1" = api ] && { echo '{}'; exit 0; }; exit 0
GH
cat > bin/misty <<'M'
#!/usr/bin/env bash
[ "$1 $2" = "publish --help" ] && { echo " -m META -f FILE --sandbox --output"; exit 0; }
[ "$1 $2" = "ots --help" ] && { echo "usage: misty ots [-h] {stamp,verify,upgrade} path"; exit 0; }
case "$1" in
 --help) echo "commands: init validate transform package ots publish"; exit 0;;
 ots) [ "$2" = stamp ] || exit 2; : > "$3.ots"; echo "stamped -> $3.ots"; exit 0;;
 validate) exit 0;;
 publish) o=""; while [ $# -gt 0 ]; do [ "$1" = --output ] && o="$2"; shift; done
   echo '{"doi":"10.5281/zenodo.42424242","concept_doi":"10.5281/zenodo.42424241"}' > "$o"; exit 0;;
esac; exit 0
M
chmod +x bin/gh bin/misty
mkdir -p tpl/js tpl/config tpl/assets/figures tpl/assets/theme tpl/readers
echo '<!doctype html>' > tpl/index.html; echo 'export const c=1' > tpl/js/core.js
for ph in placeholder-01.svg placeholder-3d.svg cover.svg; do echo '<svg/>' > "tpl/assets/figures/$ph"; done
echo '{}' > tpl/config/readers.config.json; echo '{}' > tpl/config/features.config.json
( cd tpl && git init -q -b main && git add -A && git commit -qm t )
git init -q --bare forge/zistgah/kitab.git && ( cd tpl && git push -q "$W/forge/zistgah/kitab.git" main )
python3 -c "
import struct,zlib,sys
def png(p,c):
    def ch(t,d):
        x=t+d; return struct.pack('>I',len(d))+x+struct.pack('>I',zlib.crc32(x))
    raw=b''.join(b'\x00'+bytes([c,c,c])*4 for _ in range(4))
    open(p,'wb').write(b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',4,4,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b''))
for i,c in enumerate([10,60,110,160,210]): png('plates/plate-%02d.png'%(i+1),c)
"
M="python3 $SRC/matba.py"

echo "== cli =="
$M new demo --title "A Demo Book" --subtitle "How it works" --repo zistgah/demo >/dev/null && ok "new" || bad "new"
$M intake demo "$W/plates" > in1.json 2>&1; python3 -c "import json;d=json.load(open('in1.json'));assert d['total']==5,d" && ok "intake 5 plates" || { bad "intake"; cat in1.json; }
cp plates/plate-01.png plates/dupe.png
$M intake demo "$W/plates" > in2.json 2>&1; python3 -c "import json;d=json.load(open('in2.json'));assert any('dupe' in x[0] for x in d['duplicates']),d" && ok "duplicate bytes refused by hash" || { bad "dupe not caught"; cat in2.json; }
$M doctor demo >/dev/null 2>&1 && bad "doctor passed an unfinished project" || ok "doctor FAILS an unfinished project"
{ $M doctor demo 2>&1 || true; } | grep -qi 'cover' && ok "doctor names the missing cover" || bad "cover not reported"
printf 'plate-01\tThe First Plate\tsub one\tPart One\ta;b\tLead one.\tWhy it matters.\nplate-02\tThe Second\tsub two\tPart One\tc\tLead two.\tBecause.\nplate-03\tThe Third\t\tPart Two\td\tLead three.\t\nplate-04\tThe Fourth\t\tPart Two\te\tLead four.\t\n' > bulk.tsv
$M bulk demo bulk.tsv | grep -q '4 rows matched' && ok "bulk paste fills 4 plates" || bad "bulk"
$M set demo plate-05 --cover >/dev/null && ok "cover set" || bad "cover"
python3 - <<'PY'
import json,os
p=os.path.join(os.environ['MATBA_HOME'],'demo','project.json')
d=json.load(open(p)); d['description']='<p>A demo.</p>'; d['keywords']=['demo']
d['plates']=[q for q in d['plates'] if q['file']!='dupe.png']
json.dump(d,open(p,'w'),indent=2)
PY
$M doctor demo >/dev/null 2>&1 && ok "doctor clean once complete" || { bad "doctor still failing"; $M doctor demo; }
$M build demo > b.json 2>&1; python3 -c "import json;assert json.load(open('b.json'))['ok']" && ok "build" || { bad "build"; cat b.json; }
python3 -c "
import json,os
b=json.load(open(os.path.join(os.environ['MATBA_HOME'],'demo','payload','book.config.json')))
assert len(b['structure']['chapters'])==4, b['structure']['chapters']
assert len(b['structure']['parts'])==2
assert b['meta']['doi'] is None and b['meta']['repo']=='zistgah/demo'
c=json.load(open(os.path.join(os.environ['MATBA_HOME'],'demo','payload','content','ch-01.json')))
f=[x for x in c['blocks'] if x['type']=='figure'][0]
assert 'Balance of Interpretation' in f['seed']['prompt']
" && ok "payload: 4 chapters, 2 parts, doi null, seed carries the primitive" || bad "payload shape"
[ -f "$MATBA_HOME/demo/seed_demo.sh" ] && bash -n "$MATBA_HOME/demo/seed_demo.sh" && ok "generated seeder parses" || bad "seeder"
grep -q 'dukedom' "$MATBA_HOME/demo/seed_demo.sh" && bad "STALE STRING 'dukedom' in generated seeder" || ok "no stale book name in the seeder (the paradox/duke2 leak)"
grep -q 'REVIEW.md defects REVIEW.md' "$MATBA_HOME/demo/seed_demo.sh" && bad "mangled review line" || ok "mint banner is not mangled"
grep -q 'misty ots stamp' "$MATBA_HOME/demo/seed_demo.sh" && ok "real ots signature" || bad "ots signature"
grep -q 'already stamped' "$MATBA_HOME/demo/seed_demo.sh" && ok "re-stamp is skipped, not retried into a warning" || bad "no restamp guard"
grep -q 'push skipped (idempotent)' "$MATBA_HOME/demo/seed_demo.sh" && ok "no-op push is skipped (the 4-commit churn)" || bad "no idempotent push"
grep -q -- '--force' "$MATBA_HOME/demo/seed_demo.sh" && bad "--force present" || ok "no --force"

echo "== run: stage / push / mint =="
export DEMO_TEMPLATE=zistgah/kitab DEMO_ESTATE=/nonexistent ZENODO_TOKEN_PATH="$W/tok"; echo tok > "$W/tok"
$M run demo stage >stage.log 2>&1
grep -q 'contract: PASS' stage.log && ok "stage: contract passes" || { bad "stage contract"; tail -5 stage.log; }
grep -q 'staged only' stage.log && ok "stage writes nothing upstream" || bad "stage overreached"
[ -z "$(git -C "$W/forge/zistgah/demo.git" rev-parse --verify -q HEAD 2>/dev/null)" ] && ok "…confirmed: remote still empty" || bad "stage pushed"
grep -q 'remote created and VERIFIED' stage.log && ok "absent remote created + verified" || bad "remote not created"
ls "$MATBA_HOME/demo/work/demo-repo/assets/figures/" | grep -qE 'placeholder-|cover\.svg' \
  && bad "template placeholders survived (these got minted once)" || ok "template placeholders swept"
printf 'PUSH seed\n' | $M run demo push >push.log 2>&1
grep -q 'pushed and VERIFIED' push.log && ok "push: postcondition asserted" || { bad "push"; tail -6 push.log; }
n1=$(git -C "$W/forge/zistgah/demo.git" rev-list --count HEAD 2>/dev/null || echo 0)
printf 'PUSH seed\n' | $M run demo push >push2.log 2>&1
grep -q 'push skipped (idempotent)' push2.log && ok "second push is a NO-OP (no churn commit)" || bad "churned"
n2=$(git -C "$W/forge/zistgah/demo.git" rev-list --count HEAD 2>/dev/null || echo 0)
[ "$n1" = "$n2" ] && ok "…commit count unchanged ($n1)" || bad "history grew: $n1 -> $n2"
printf 'PUSH seed\nWRONG\n' | $M run demo mint --override-rehearsal >mg.log 2>&1
python3 -c "
import json,os;d=json.load(open(os.path.join(os.environ['MATBA_HOME'],'demo','work','demo-repo','config','book.config.json')))
assert d['meta']['doi'] is None" && ok "refused MINT gate records nothing" || bad "mint gate did not bite"
printf 'PUSH seed\nMINT demo\n' | $M run demo mint --override-rehearsal >mint.log 2>&1
grep -q 'DOI minted: 10.5281/zenodo.42424242' mint.log && ok "mint: DOI parsed from misty result" || { bad "mint"; tail -8 mint.log; }
python3 -c "
import json,os
r=os.path.join(os.environ['MATBA_HOME'],'demo','work','demo-repo')
assert json.load(open(r+'/config/book.config.json'))['meta']['doi']=='10.5281/zenodo.42424242'
assert json.load(open(r+'/metadata/misty.json'))['doi']=='10.5281/zenodo.42424242'" \
  && ok "DOI recorded back into BOTH files" || bad "record-back"
( cd "$MATBA_HOME/demo/work/demo-repo" && sha256sum -c --quiet MANIFEST.sha256 ) && ok "manifest verifies after reseal" || bad "manifest"
printf 'nope\nalso nope\nstill nope\nMINT demo\n' | $M run demo mint --override-rehearsal >gb.log 2>&1
grep -q 'gate refused' gb.log && ok "gate scan still BITES: 3 wrong lines abort even with the right word 4th" || bad "gate scan too permissive"

echo "== web =="
python3 - "$SRC/matba.py" <<'PY' && ok "web server boots and serves the page + API" || bad "server"
import importlib.util, sys, threading, time, urllib.request, json, os
spec=importlib.util.spec_from_file_location('m',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.HOME=os.environ['MATBA_HOME']
t=threading.Thread(target=m.serve,args=(8791,),daemon=True); t.start(); time.sleep(0.6)
assert b'matba' in urllib.request.urlopen('http://127.0.0.1:8791/').read()
r=json.load(urllib.request.urlopen('http://127.0.0.1:8791/api/projects'))
assert r['projects'] and r['projects'][0]['slug']=='demo', r
p=json.load(urllib.request.urlopen('http://127.0.0.1:8791/api/project?slug=demo'))
assert p['doctor']==[] and len(p['project']['plates'])==5
PY

echo; printf '  ===== %d pass, %d fail =====\n' "$P" "$F"; [ "$F" = 0 ]
