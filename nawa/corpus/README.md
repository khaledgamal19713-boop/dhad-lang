# NAWA scholarly corpus
This is the controlled entry point for Arabic-language and Islamic-studies source material. No book corpus is bundled yet; an empty or sample corpus must never be represented as book training.

## Required bibliographic identity
Each chunk must retain work ID, title, author, edition/editor/publisher/year where known, explicit rights status, and evidence for that status. Allowed rights statuses: public-domain, licensed, permission-required, unknown.

## Chunk provenance
Preserve exact source text, stable chunk ID and content hash, volume/page/section locators where available, source file, extraction method, OCR confidence, and human-review flag. Never invent locators. Keep author text, editor notes, footnotes, marginalia, manuscript readings, and modern commentary as distinct layers.

## Quality safeguards
- Source text is immutable; corrections belong in a versioned transcription layer.
- Low-confidence OCR is blocked until human review.
- Deduplicate without deleting edition-specific witnesses.
- Split train/validation/test by work to prevent leakage.
- Training examples must cite chunk IDs and be adjudicated or expert-reviewed.
- Fiqh examples must identify madhhab and whether the answer is transmitted, takhrij, comparative, or hypothetical.
- Hadith examples must identify method and preserve source/chain references.
- Model-generated answers are never gold labels without expert adjudication.

Commands: npm run corpus:check -- path/to/corpus.jsonl
