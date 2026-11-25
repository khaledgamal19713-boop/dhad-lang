# ضاد — لغة برمجة عربية موحدة

## NAWA research and training foundation

The NAWA workbench now includes a provenance-first corpus ingestion and validation pipeline alongside the existing Dhad runtime integration.

- Corpus ingestion preserves work identity, edition metadata, exact text, locators, extraction method, OCR confidence, and rights status.
- Quality gates block missing bibliographic identity, missing rights metadata, and unreviewed low-confidence OCR.
- Train/validation/test partitioning is by work, preventing chunks from the same book leaking across partitions.
- Supervised scholarly examples require explicit evidence references and expert adjudication; fiqh and hadith examples require their domain-specific methodological scope.
- CI runs Dhad integration tests, NAWA kernel tests, corpus tests, and the production build.

### Current factual boundary

The repository does not yet contain an Arabic or Islamic-studies book corpus, adjudicated training examples, or newly trained neural model weights. The new pipeline prepares and validates these inputs; it does not pretend that writing ingestion code equals training on books. A real training run requires source files with verified rights, extraction/OCR, scholarly review, a selected base model, and compute.

### Run

```bash
npm test
npm run build
npm run corpus:check -- path/to/corpus.jsonl
npm run training:gate -- path/to/corpus.jsonl path/to/examples.jsonl
```

See nawa/corpus/README.md and nawa/training/README.md for data contracts and scholarly safeguards.
