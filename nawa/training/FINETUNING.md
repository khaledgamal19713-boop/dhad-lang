# LoRA fine-tuning runbook

This script performs a real parameter-efficient fine-tuning run; it is not executed by ordinary GitHub CI. It requires an approved source corpus, adjudicated examples, a compatible open-weight base model, and a CUDA GPU.

## Preconditions

1. Corpus passes the Node quality gate and every source has resolved rights evidence.
2. Training examples cite exact chunk IDs, are expert-reviewed, and preserve madhhab/method scope.
3. The source-work connected-component split produces non-empty train, validation, and test sets. Examples sharing any source work are kept together.
4. The selected base model's license and Arabic capability have been reviewed.
5. A GPU runtime has enough memory for the chosen model and sequence length.

## Install and run

```bash
pip install -r nawa/training/requirements.txt
python nawa/training/finetune_lora.py \
  --corpus nawa/corpus/manifest.jsonl \
  --examples nawa/training/adjudicated-examples.jsonl \
  --base-model <approved-open-model-id-or-local-path> \
  --output-dir artifacts/nawa-arabic-scholar-lora
```

The script blocks CPU-only runs, unresolved rights, low-confidence unreviewed OCR, unreviewed targets, missing citations, and empty source-disjoint splits. It evaluates held-out token loss before and after training and does not promote the adapter if the configured regression gate fails.

A passing loss gate is not evidence of fiqh correctness, hadith grading competence, or sound tarjih. Production promotion still requires a separate source-grounded benchmark, blind expert review, adversarial counterexamples, and regression testing across schools and disciplines.
