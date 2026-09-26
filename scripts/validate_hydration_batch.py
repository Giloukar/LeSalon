#!/usr/bin/env python3
"""Validate reviewed LexiMind curation batches and generate safe SQL updates."""

import argparse
import json
import pathlib
import re
import sys
import unicodedata
from urllib.parse import urlparse

ALLOWED_POS = {"NOM", "VER", "ADJ", "ADV"}
ALLOWED_DECISIONS = {"approved", "rejected"}
ALLOWED_REASONS = {
    "wiktionary_pos_and_sense_verified",
    "orthographic_variant",
    "archaic_or_redirect_form",
    "pos_mismatch",
    "pronominal_mismatch",
    "inflected_form",
    "no_stable_lexical_entry",
    "regional_low_value",
    "named_entity",
    "foreign_or_noise",
}
WORD_RE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ'’\- ]{2,64}$")
REDIRECT_RE = re.compile(
    r"^\s*(?:autre|ancienne)?\s*(?:orthographe|variante|forme|flexion|participe|pluriel|féminin|masculin|"
    r"abréviation|apocope|ellipse|synonyme)\b",
    re.I,
)
BAD_LEAD_RE = re.compile(r"^\s*[.,;:]")
BAD_END_RE = re.compile(r"[:(,]\s*$")


def norm_word(value: str) -> str:
    return unicodedata.normalize("NFC", value.strip()).casefold()


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def valid_wiktionary_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return (
        parsed.scheme == "https"
        and parsed.netloc == "fr.wiktionary.org"
        and parsed.path.startswith("/wiki/")
    )


def validate_entry(entry: dict, index: int) -> list[str]:
    errors: list[str] = []
    for key in ("word", "pos"):
        if not isinstance(entry.get(key), str) or not entry[key].strip():
            errors.append(f"entry {index}: missing/empty {key}")
    if errors:
        return errors

    word = entry["word"].strip()
    pos = entry["pos"].strip().upper()
    decision = str(entry.get("decision") or "approved").strip().lower()

    if pos not in ALLOWED_POS:
        errors.append(f"entry {index} {word!r}: unsupported POS {pos!r}")
    if not WORD_RE.fullmatch(word):
        errors.append(f"entry {index} {word!r}: suspicious word spelling")
    if decision not in ALLOWED_DECISIONS:
        errors.append(f"entry {index} {word!r}: unsupported decision {decision!r}")
        return errors

    if decision == "approved":
        for key in ("definition", "source_url"):
            if not isinstance(entry.get(key), str) or not entry[key].strip():
                errors.append(f"entry {index} {word!r}: approved entry needs {key}")
        if errors:
            return errors
        definition = entry["definition"].strip()
        source_url = entry["source_url"].strip()
        if len(definition) < 20 or len(definition) > 360:
            errors.append(f"entry {index} {word!r}: definition length {len(definition)} outside 20..360")
        if REDIRECT_RE.search(definition):
            errors.append(f"entry {index} {word!r}: redirect-style definition")
        if BAD_LEAD_RE.search(definition):
            errors.append(f"entry {index} {word!r}: definition starts with punctuation fragment")
        if BAD_END_RE.search(definition):
            errors.append(f"entry {index} {word!r}: definition appears truncated")
        if definition[-1:] not in ".!?…»”":
            errors.append(f"entry {index} {word!r}: definition has no terminal punctuation")
        if not valid_wiktionary_url(source_url):
            errors.append(f"entry {index} {word!r}: source_url must be an https://fr.wiktionary.org/wiki/... URL")
    else:
        reason = str(entry.get("reason") or "").strip()
        if reason not in ALLOWED_REASONS - {"wiktionary_pos_and_sense_verified"}:
            errors.append(f"entry {index} {word!r}: rejected entry needs a supported reason")
        evidence_url = str(entry.get("evidence_url") or "").strip()
        if evidence_url and not valid_wiktionary_url(evidence_url):
            errors.append(f"entry {index} {word!r}: evidence_url must be an https://fr.wiktionary.org/wiki/... URL")

    return errors


def build_sql(entries: list[dict], batch_name: str) -> str:
    chunks = [
        f"-- Generated from reviewed LexiMind curation batch {batch_name}.",
        "-- Match by normalized lexical identity; never by generated IDs.",
        "",
    ]
    for entry in entries:
        word = entry["word"].strip()
        pos = entry["pos"].strip().upper()
        decision = str(entry.get("decision") or "approved").strip().lower()

        if decision == "approved":
            definition = entry["definition"].strip()
            source_url = entry["source_url"].strip()
            chunks.append(
                "update public.lexicon\n"
                f"set definition={sql_quote(definition)},\n"
                "    source='Wiktionnaire fr + Lexique 4',\n"
                f"    source_url={sql_quote(source_url)},\n"
                "    content_status='ready',\n"
                "    curation_state='approved',\n"
                "    curation_reason='wiktionary_pos_and_sense_verified',\n"
                f"    curation_source_url={sql_quote(source_url)},\n"
                "    curated_at=now()\n"
                f"where lower(word)=lower({sql_quote(word)}) and upper(pos)={sql_quote(pos)}\n"
                "  and source='Lexique 4' and content_status='hidden'\n"
                "  and coalesce(curation_state,'pending_source')='pending_source'\n"
                "  and nullif(btrim(definition),'') is null;\n"
            )
        else:
            reason = str(entry["reason"]).strip()
            evidence_url = str(entry.get("evidence_url") or "").strip()
            evidence_sql = (
                f",\n    curation_source_url={sql_quote(evidence_url)}"
                if evidence_url
                else ""
            )
            chunks.append(
                "update public.lexicon\n"
                "set curation_state='rejected',\n"
                f"    curation_reason={sql_quote(reason)}{evidence_sql},\n"
                "    curated_at=now()\n"
                f"where lower(word)=lower({sql_quote(word)}) and upper(pos)={sql_quote(pos)}\n"
                "  and source='Lexique 4' and content_status='hidden'\n"
                "  and coalesce(curation_state,'pending_source')='pending_source'\n"
                "  and nullif(btrim(definition),'') is null;\n"
            )
    return "\n".join(chunks)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Reviewed curation JSON batch")
    parser.add_argument("--sql-out", help="Write generated SQL to this path")
    args = parser.parse_args()

    path = pathlib.Path(args.input)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: cannot read {path}: {exc}", file=sys.stderr)
        return 2

    if not isinstance(data, list) or not data:
        print("ERROR: batch must be a non-empty JSON array", file=sys.stderr)
        return 2

    errors: list[str] = []
    seen: set[tuple[str, str]] = set()
    for i, entry in enumerate(data, 1):
        if not isinstance(entry, dict):
            errors.append(f"entry {i}: expected object")
            continue
        errors.extend(validate_entry(entry, i))
        if isinstance(entry.get("word"), str) and isinstance(entry.get("pos"), str):
            key = (norm_word(entry["word"]), entry["pos"].strip().upper())
            if key in seen:
                errors.append(f"entry {i} {entry['word']!r}: duplicate word+POS in batch")
            seen.add(key)

    if errors:
        print("\n".join(f"ERROR: {e}" for e in errors), file=sys.stderr)
        return 1

    sql = build_sql(data, path.stem)
    approved = sum((e.get("decision") or "approved").lower() == "approved" for e in data)
    rejected = len(data) - approved
    if args.sql_out:
        out = pathlib.Path(args.sql_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(sql, encoding="utf-8")
        print(f"valid {len(data)} entries ({approved} approved, {rejected} rejected); SQL written to {out}")
    else:
        print(f"valid {len(data)} entries ({approved} approved, {rejected} rejected)")
        print(sql)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
