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
set -uo pipefail
OUT="${OUT:-/Volumes/CORSAIR/pscale/beach-backups}"
SPLIT="${SPLIT:-}"
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
  gzip -c "$TMP/snap.json" > "$OUT/beach-$ts.json.gz"
  cp "$TMP/snap.json" "$OUT/beach-latest.json"
  echo "✓ complete image: $kc keys → $OUT/beach-$ts.json.gz ($(du -h "$OUT/beach-$ts.json.gz" | cut -f1))"
  ls -1t "$OUT"/beach-*.json.gz 2>/dev/null | tail -n +401 | while read -r f; do rm -f "$f"; done

  # Opportunistic copy to an external DR volume (CORSAIR) when it is mounted AND writable.
  # launchd cannot write external volumes without Full Disk Access, so this skips silently there
  # (and lands on manual runs, whose shell has disk access).
  if [ -n "${CORSAIR_DIR:-}" ]; then
    cvol="/Volumes/$(echo "$CORSAIR_DIR" | cut -d/ -f3)"
    if [ -d "$cvol" ] && mkdir -p "$CORSAIR_DIR" 2>/dev/null && ( : > "$CORSAIR_DIR/.wtest" ) 2>/dev/null; then
      rm -f "$CORSAIR_DIR/.wtest"
      cp "$OUT/beach-$ts.json.gz" "$OUT/beach-latest.json" "$CORSAIR_DIR/" && echo "  → also copied to $CORSAIR_DIR"
      ls -1t "$CORSAIR_DIR"/beach-*.json.gz 2>/dev/null | tail -n +401 | while read -r f; do rm -f "$f"; done
    else
      echo "  ($CORSAIR_DIR not writable from here — copy skipped; grant Full Disk Access for launchd, else it copies on manual runs)"
    fi
  fi
fi

# ── optional per-block content mirror (no locks) → SPLIT ──
if [ -n "$SPLIT" ]; then
  n=0
  while IFS= read -r k; do
    origin=${k#pscale-beach-v2:}; origin=${origin%%:block:*}; origin=${origin#https://}
    name=${k##*:block:}
    enc=$(jq -rn --arg s "$name" '$s|@uri')
    mkdir -p "$SPLIT/$origin"
    jq --arg k "$k" '.data[$k]' "$TMP/snap.json" > "$SPLIT/$origin/$enc.json"
    n=$((n+1))
  done < <(jq -r '.data | keys[] | select(contains(":block:"))' "$TMP/snap.json")
  echo "  split: $n per-block content files → $SPLIT (locks excluded)"
fi
