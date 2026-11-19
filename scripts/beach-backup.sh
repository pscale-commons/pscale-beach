#!/bin/bash
# beach-backup.sh — DR snapshot in PURE bash + curl + jq. Deliberately NO node: node's
# networking (both undici fetch and node-spawned curl) hangs under launchd, while bash-spawned
# curl is proven to work there (diagnosed 2026-07-14). Complete image: every pscale-beach-v2:*
# key — blocks AND locks, all origins, and the hashes beside them (touched, born, sizes) — the
# restorable snapshot. Read-only against Upstash.
#
#   set -a; . <clone>/.env.local; set +a
#   OUT=/Volumes/CORSAIR/pscale/beach-backups SPLIT=/path/to/mirror ./beach-backup.sh
#
# OUT   (env, default /Volumes/CORSAIR/pscale/beach-backups) complete image, gzipped + timestamped.
#       Skipped gracefully if its volume is not mounted. Carries locks — keep it private.
# SPLIT (env, optional) per-block CONTENT files (no locks) for a git mirror — safe to make public.
#
# THE TRIMS (who-answers 1.1116; bsp-mcp #564 §4.5 item 3) — retention stated and kept:
# BEACH_IMAGE_KEY  (env, optional) set, and every image is SEALED at rest (OpenSSL's own envelope,
#                  aes-256-cbc, pbkdf2: scripts/image-seal.mjs opens it, so does `openssl enc -d`),
#                  named beach-<ts>.json.gz.enc; the plain working copy beach-latest.json then stays in
#                  OUT alone and never reaches CORSAIR_DIR. Unset, images are plain, and the run says so:
#                  an image carries every block and every lock hash of the beach.
# KEEP_IMAGES      (env, default 400) the newest N images are kept in OUT and CORSAIR_DIR; older go.
# SPLIT_EXCLUDE    (env, optional) a bash regex of block NAMES the mirror never carries. Unset, the
#                  apex notice's own line is heard — `people_keeping=passport:,history:,pool:` (name
#                  prefixes, comma-joined; a prefix without its colon names a bare block; `*` is every
#                  block) — and only from behind the notice's root latch, as the handler hears it
#                  (the notice is the gate, who-answers 1.11). A people-keeping block already in the
#                  mirror is removed from it; its past versions stay in the repository's history until
#                  scripts/tombstone.mjs rewrites them.
# The split is ONE jq pass over the image (two per block, one re-parsing the whole image, is what
# the scheduled run's watchdog kept killing); its files are compact JSON, so the first run after
# this change rewrites every file once.
set -uo pipefail
OUT="${OUT:-/Volumes/CORSAIR/pscale/beach-backups}"
SPLIT="${SPLIT:-}"
KEEP_IMAGES="${KEEP_IMAGES:-400}"
IMAGE_KEY="${BEACH_IMAGE_KEY:-}"
SPLIT_EXCLUDE="${SPLIT_EXCLUDE:-}"
: "${KV_REST_API_URL:?source your beach clone .env.local first}"
: "${KV_REST_API_TOKEN:?source your beach clone .env.local first}"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
u() { curl -sS --max-time 25 -X POST "$KV_REST_API_URL" -H "Authorization: Bearer $KV_REST_API_TOKEN" -H "Content-Type: application/json" --data-binary "$1"; }
pl() { curl -sS --max-time 25 -X POST "$KV_REST_API_URL/pipeline" -H "Authorization: Bearer $KV_REST_API_TOKEN" -H "Content-Type: application/json" --data-binary "$1"; }

# ── SCAN every key ──
cursor=0; : > "$TMP/keys"
while :; do
  resp=$(u "$(jq -nc --arg c "$cursor" '["SCAN",$c,"MATCH","pscale-beach-v2:*","COUNT",1000]')") || { echo "SCAN curl failed"; exit 1; }
  echo "$resp" | jq -e '.result' >/dev/null 2>&1 || { echo "SCAN error: $resp"; exit 1; }
  echo "$resp" | jq -r '.result[1][]' >> "$TMP/keys"
  cursor=$(echo "$resp" | jq -r '.result[0]')
  [ "$cursor" = "0" ] && break
done
sort -u "$TMP/keys" -o "$TMP/keys"

# ── MGET in batches of 100 → per-batch {key:value} objects (values are stored JSON strings) ──
split -l 100 "$TMP/keys" "$TMP/b."
: > "$TMP/objs"
for bf in "$TMP"/b.*; do
  resp=$(u "$(jq -Rnc '["MGET"] + [inputs]' < "$bf")") || { echo "MGET curl failed"; exit 1; }
  keys=$(jq -Rnc '[inputs]' < "$bf")
  echo "$resp" | jq -c --argjson keys "$keys" '
    [$keys, .result] | transpose
    | map({ (.[0]): (.[1] | if type=="string" then (try fromjson catch .) else . end) })
    | add' >> "$TMP/objs"
done

# ── hashes: MGET reads strings only and answers nil for a hash (touched, born, sizes), so every
# key that came back nil is asked its TYPE in one pipelined call, and each hash is read whole with
# HGETALL. Kept apart, under `hashes`, so a restore can put each back as the hash it is: a nil
# kept in `data`, written back by an older restore, became the string "null" and the beach could
# stamp nothing after it. A key of any other kind (none is written today) is named, never kept
# as a nil. ──
jq -rs 'add // {} | to_entries[] | select(.value == null) | .key' "$TMP/objs" > "$TMP/nils"
: > "$TMP/hobjs"
if [ -s "$TMP/nils" ]; then
  split -l 100 "$TMP/nils" "$TMP/n."
  for nf in "$TMP"/n.*; do
    resp=$(pl "$(jq -Rnc '[inputs | ["TYPE", .]]' < "$nf")") || { echo "TYPE curl failed"; exit 1; }
    echo "$resp" | jq -e 'type == "array" and all(.[]; .error == null)' >/dev/null 2>&1 || { echo "TYPE error: $resp"; exit 1; }
    kinds=$(jq -Rnc --argjson r "$resp" '[[inputs], ($r | map(.result))] | transpose' < "$nf")
    echo "$kinds" | jq -r '.[] | select(.[1] != "hash" and .[1] != "none") | "  ! \(.[0]) is a \(.[1]) the backup does not read — not in the snapshot"'
    echo "$kinds" | jq -r '.[] | select(.[1] == "hash") | .[0]' > "$nf.h"
    [ -s "$nf.h" ] || continue
    resp=$(pl "$(jq -Rnc '[inputs | ["HGETALL", .]]' < "$nf.h")") || { echo "HGETALL curl failed"; exit 1; }
    echo "$resp" | jq -e 'type == "array" and all(.[]; .error == null)' >/dev/null 2>&1 || { echo "HGETALL error: $resp"; exit 1; }
    jq -Rnc --argjson r "$resp" '
      [[inputs], ($r | map(.result))] | transpose
      | map({ (.[0]): ((.[1] // []) as $a | [range(0; $a | length; 2) as $i | { ($a[$i]): $a[$i + 1] }] | add // {}) })
      | add // {}' < "$nf.h" >> "$TMP/hobjs"
  done
fi

# ── assemble snapshot ──
created=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq -s 'add // {}' "$TMP/hobjs" > "$TMP/hashes.json"
jq -s --arg ts "$created" --slurpfile h "$TMP/hashes.json" '
  (add // {} | with_entries(select(.value != null))) as $data | $h[0] as $hashes | {
    meta: { created_at: $ts, key_count: (($data|keys|length) + ($hashes|keys|length)),
      blocks: ([$data|keys[]|select(contains(":block:"))]|length),
      locks:  ([$data|keys[]|select(contains(":locks:"))]|length),
      hashes: ($hashes|keys|length) },
    data: $data, hashes: $hashes }' "$TMP/objs" > "$TMP/snap.json"
kc=$(jq '.meta.key_count' "$TMP/snap.json")

# ── complete image → OUT ──
ts=$(echo "$created" | tr ':' '-')
vol="/Volumes/$(echo "$OUT" | cut -d/ -f3)"
if [[ "$OUT" == /Volumes/* ]] && [ ! -d "$vol" ]; then
  echo "… skipped complete image — $vol not mounted (SPLIT mirror still runs)"
else
  mkdir -p "$OUT"
  if [ -n "$IMAGE_KEY" ]; then
    img="$OUT/beach-$ts.json.gz.enc"
    gzip -c "$TMP/snap.json" | BEACH_IMAGE_KEY="$IMAGE_KEY" openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BEACH_IMAGE_KEY -out "$img" || { echo "sealing the image failed"; exit 1; }
  else
    img="$OUT/beach-$ts.json.gz"
    gzip -c "$TMP/snap.json" > "$img"
    echo "  (this image is PLAIN, and carries every block and every lock hash — set BEACH_IMAGE_KEY and each image is sealed at rest)"
  fi
  cp "$TMP/snap.json" "$OUT/beach-latest.json"
  echo "✓ complete image: $kc keys → $img ($(du -h "$img" | cut -f1)); the newest $KEEP_IMAGES are kept"
  ls -1t "$OUT"/beach-*.json.gz "$OUT"/beach-*.json.gz.enc 2>/dev/null | tail -n +$((KEEP_IMAGES + 1)) | while read -r f; do rm -f "$f"; done

  # Opportunistic copy to an external DR volume (CORSAIR) when it is mounted AND writable.
  # launchd cannot write external volumes without Full Disk Access, so this skips silently there
  # (and lands on manual runs, whose shell has disk access).
  if [ -n "${CORSAIR_DIR:-}" ]; then
    cvol="/Volumes/$(echo "$CORSAIR_DIR" | cut -d/ -f3)"
    if [ -d "$cvol" ] && mkdir -p "$CORSAIR_DIR" 2>/dev/null && ( : > "$CORSAIR_DIR/.wtest" ) 2>/dev/null; then
      rm -f "$CORSAIR_DIR/.wtest"
      if [ -n "$IMAGE_KEY" ]; then
        # sealed images only on the external drive: the plain working copy stays in OUT
        rm -f "$CORSAIR_DIR/beach-latest.json"
        cp "$img" "$CORSAIR_DIR/" && echo "  → also copied to $CORSAIR_DIR (sealed)"
      else
        cp "$img" "$OUT/beach-latest.json" "$CORSAIR_DIR/" && echo "  → also copied to $CORSAIR_DIR"
      fi
      ls -1t "$CORSAIR_DIR"/beach-*.json.gz "$CORSAIR_DIR"/beach-*.json.gz.enc 2>/dev/null | tail -n +$((KEEP_IMAGES + 1)) | while read -r f; do rm -f "$f"; done
    else
      echo "  ($CORSAIR_DIR not writable from here — copy skipped; grant Full Disk Access for launchd, else it copies on manual runs)"
    fi
  fi
fi

# ── optional per-block content mirror (no locks) → SPLIT ──
if [ -n "$SPLIT" ]; then
  # The apex notice's people-keeping line, heard only from behind its root latch (as the handler hears it).
  if [ -z "$SPLIT_EXCLUDE" ] && [ -n "${BEACH_ORIGIN:-}" ]; then
    pk=$(jq -r --arg b "pscale-beach-v2:$BEACH_ORIGIN:block:notice" --arg l "pscale-beach-v2:$BEACH_ORIGIN:locks:notice" '
      if ((.data[$l] // {}) | has("_")) then ([.data[$b] // {} | .. | strings | select(test("^\\s*people_keeping="))] | .[0] // "") else "" end' "$TMP/snap.json" \
      | sed -n 's/^[[:space:]]*people_keeping=\([^[:space:]]*\).*/\1/p')
    if [ "$pk" = "*" ]; then SPLIT_EXCLUDE='.'
    elif [ -n "$pk" ]; then
      alts=""
      IFS=',' read -ra prefixes <<< "$pk"
      for pre in "${prefixes[@]}"; do
        [ -n "$pre" ] || continue
        esc=$(printf '%s' "$pre" | sed 's/[][\.*^$+?(){}|]/\\&/g')
        alts="${alts:+$alts|}${esc}"
        case "$pre" in *:) alts="$alts|${esc%:}\$" ;; esac
      done
      [ -n "$alts" ] && SPLIT_EXCLUDE="^($alts)"
    fi
    [ -n "$SPLIT_EXCLUDE" ] && echo "  split: the notice's people-keeping line is heard — leaving out $pk"
  fi
  n=0; x=0
  while IFS=$'\t' read -r k enc v; do
    origin=${k#pscale-beach-v2:}; origin=${origin%%:block:*}; origin=${origin#https://}
    name=${k##*:block:}
    if [ -n "$SPLIT_EXCLUDE" ] && [[ $name =~ $SPLIT_EXCLUDE ]]; then
      rm -f "$SPLIT/$origin/$enc.json"; x=$((x+1)); continue
    fi
    mkdir -p "$SPLIT/$origin"
    printf '%s\n' "$v" > "$SPLIT/$origin/$enc.json"
    n=$((n+1))
  done < <(jq -r '.data | to_entries[] | select(.key | contains(":block:")) | "\(.key)\t\(.key | sub(".*:block:"; "") | @uri)\t\(.value | tojson)"' "$TMP/snap.json")
  echo "  split: $n per-block content files → $SPLIT (locks excluded$([ "$x" -gt 0 ] && echo "; $x people-keeping blocks left out"))"
fi
