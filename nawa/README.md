# NAWA AI — Autonomous Intelligence Foundation

This is the first executable NAWA layer inside the existing ضاد repository. It is deliberately an engine-first system, not a claim that a new neural foundation model has already been trained.

## Training\n- Guarded LoRA fine-tuning pipeline for approved base models, with expert-reviewed targets, source-work-disjoint splits, rights/OCR preflight, and a held-out loss regression gate. See FINETUNING.md.\n\n## Runtime
- Arabic-aware BM25 retrieval index that returns exact passage references and edition/page locators.
- Declarative scholarly rule base with school/method scope, premises, exceptions, evidence dependencies, and explicit conflict sets; integrated as an optional stage in the shared task kernel.
- Evidence-preserving knowledge objects with source, scope, confidence, and provenance.
- Deterministic rule engine with explicit premises, exceptions, and defeaters.
- Coordinated skill/engine registry; skills can call one another without being isolated products.
- OpenAI-compatible model adapter (optional; configured only through environment variables).
- Task-scoped fast state that is discarded after each run; persistent skills and validated patterns remain.
- Evaluation hooks and regression tests.

## Run
Requires Node.js 18+; no third-party packages.

```bash
node --test nawa/tests/*.test.mjs
node nawa/demo.mjs
```

Optional language-model provider:
```bash
NAWA_MODEL_URL=https://api.openai.com/v1/chat/completions \
NAWA_MODEL_NAME=<model-id> \
NAWA_API_KEY=<secret> \
node nawa/demo.mjs
```

The provider is optional. Without it, the symbolic pipeline still runs and reports that generative synthesis was skipped.

## Current scope and honest boundary
This foundation is executable software, not trained neural weights. It does not claim to issue authoritative fatwas or hadith gradings. The rule engine only applies explicitly registered rules; disputed or incomplete evidence remains marked unresolved. Neural weights require a selected base model, curated corpus, compute, training run, and measured evaluation. No such training artifact is fabricated here.

## Architecture
`Kernel → Task Planner → Domain Skills ↔ Evidence Graph ↔ Rule Engine → Counterargument Engine → Verifier → Optional Model Synthesis → Evaluation`

All stages share the same case context and provenance graph. Domain modules are separate for correctness and versioning, but they operate on one shared case rather than independent silos.
