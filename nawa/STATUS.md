# NAWA — verified delivery status

## Implemented in this commit
- Engine-centric runtime and shared task workspace.
- Evidence graph retaining source, kind, scope, confidence, and relations.
- Deterministic rules with explicit exceptions/defeaters and priority.
- Coordinated research skills: evidence audit, cross-domain linking, counterargument prompts, provenance verification.
- Arabic-aware source retrieval with citation-preserving BM25 ranking.
- Multi-domain scholarly rule engine integrated into the task kernel; exposes applicability, defeaters, unavailable evidence, and competing conclusions without silently issuing final verdicts.
- Guarded LoRA fine-tuning runner with source-work-connected-component splitting, provenance checks, and held-out loss gate.
- Optional OpenAI-compatible inference adapter.
- Task-scoped transient state and validated persistent pattern memory.
- Node test suite and runnable demo.

## Not implemented / not claimed
- No new neural model weights have been trained.
- No corpus has yet been ingested or quality-controlled.
- No benchmark establishes superiority to GPT-6 or any other model.
- No authoritative fiqh, hadith, or linguistic verdicts are emitted by the demo rules.
- No production hosting or secret credentials have been configured.

## Next engineering gates
1. Integrate the existing ضاد parser/compiler/VM as a sandboxed coding skill.
2. Add corpus ingestion with bibliographic identity, editions, page/line locators, OCR confidence, and duplicate detection.
3. Implement domain-specific rule schemas and provenance-aware conflict resolution.
4. Add benchmark sets and blind evaluation against base-model and RAG baselines.
5. Select a permissively licensed base model and run fine-tuning only after dataset and compute validation.
