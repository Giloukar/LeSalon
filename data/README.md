# LexiMind advanced corpus

LexiMind uses **Lexique 4** (New, Pallier et al., CC BY-SA 4.0) to rank French lemmas, then hydrates selected entries with definitions from the French Wiktionary.

## Production selection

The native-speaker filter keeps nouns, adjectives, verbs and adverbs only. It rejects:
- non-lemma inflected forms;
- extremely common or ultra-obscure frequency tails;
- orthographic forms that are mainly a frequent inflection of another lemma;
- homographs whose other part of speech is overwhelmingly more frequent;
- very low-context-diversity noise.

The score combines Lexique 4 lemma frequency, contextual diversity (`13_CDOrtho`), prevalence (`33_Preval`), lexical length and homograph penalties.

Normal discovery serves **difficulty 4–5** by default. For Lexique-derived entries, native-speaker difficulty is calibrated at **72+ for difficulty 4** and **84+ for difficulty 5**. Difficulty-3 entries remain in the database for compatibility/search/history but are not part of standard discovery.

Published discovery rows must also have a non-empty definition and one of the supported POS values (`NOM`, `ADJ`, `VER`, `ADV`). Review/quiz RPCs enforce the same publication guard so a word later hidden during corpus QA cannot leak back through an old progress record.

## Current production state

After the 26 September 2026 corpus-quality pass:

- `lexicon`: **14,807** rows total;
- `ready`: **10,809**;
- `hidden`: **3,998**;
- standard advanced discovery (difficulty 4–5, clean definition/POS): **9,471**;
- ready rows with a blank definition: **0**;
- ready same-word + same-POS duplicate groups: **0**.

The source breakdown is:
- `Lexique 4 + Wiktionnaire`: 6,560 ready / 28 hidden;
- `Wiktionnaire fr + Lexique 4`: 4,170 ready / 36 hidden;
- `Lexique 4`: 2,242 hidden rows, including 1,602 advanced candidates still pending source review;
- `Wiktionnaire/DBnary`: 1,691 hidden legacy rows pending selective QA;
- `Le Salon starter lexicon`: 79 ready / 1 hidden.

The QA pass preserves provenance and rows rather than deleting uncertain data. Pure spelling redirects, terse abbreviation/ellipsis redirects, audited malformed definitions and imported duplicates of curated starter entries are hidden until they can be rehydrated from a trustworthy lexical source.

A database constraint now prevents future `ready` rows from being published without both a non-empty definition and a supported POS. Audited extraction fragments are repaired only when the surviving text is already source-backed; otherwise they stay hidden.

## Reviewed hydration workflow

Hidden `Lexique 4` rows are not bulk-published just because a Wiktionary page exists. Each reviewed batch must confirm that the French lexical category matches the stored POS and that the chosen sense is a standalone, pedagogically useful definition.

Curation is persisted directly on each lexicon row:
- `pending_source`: eligible advanced candidate still awaiting source review;
- `approved`: POS and standalone sense manually verified;
- `rejected`: reviewed and intentionally excluded, with a machine-readable reason;
- `curation_source_url`: Wiktionary page used as evidence when available.

Current reviewed state: **1,602 pending / 29 approved / 305 rejected**.

1. Add a reviewed JSON batch under `data/leximind-curation-reviewed-batch-XXX.json`. Batch 001 remains backward-compatible with the original hydration-only format.
2. Mark each new record `approved` or `rejected`. Approved rows need a definition and Wiktionary URL; rejected rows need a controlled reason and may include an evidence URL.
3. Validate it with `python scripts/validate_hydration_batch.py <batch.json> --sql-out /tmp/curation.sql`.
4. Review the generated SQL and evidence URLs.
5. Apply the migration by normalized word + POS, never by generated database ID.
6. Re-run `lexicon_quality()`, curation-state counts and the discovery/quiz smoke tests.

The validator rejects unsupported POS values, blank or suspiciously short/long approved definitions, redirect-style definitions, extraction fragments, duplicate word+POS pairs, unsupported rejection reasons and non-Wiktionary source/evidence URLs.

A conservative automatic canonicalization pass is also allowed for spelling-only hyphen differences. It rejects a pending row only when a `ready` row of the same POS already exists, has a non-empty definition and Wiktionary source URL, and both spellings become identical after removing hyphens. The chosen canonical row's source URL is persisted as curation evidence. The first pass resolved **40** such variants.

A second conservative automatic pass handles nominal plurals only when the pending form is at least seven characters long and equals an already published, Wiktionary-sourced noun plus a final `s`. This resolved **120** clear plural forms without changing the published corpus.

A third exact plural pass handles forms that are the canonical sourced word plus a final `x`. It resolved **4** additional forms (`couvre-feux`, `pare-feux`, `porte-manteaux`, `vivaneaux`).

## Rebuild

`python scripts/build_advanced_lexicon.py --limit 9000`

Source: https://lexique.org/ (Lexique 4, 2026, CC BY-SA 4.0)

Wiktionary-derived definitions retain source URLs and attribution. Do not bulk-publish a rebuilt corpus without checking duplicate spellings, malformed markup and the distribution of difficulty/prevalence.
