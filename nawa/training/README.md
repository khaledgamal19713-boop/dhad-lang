# Training data contract
A source passage is not automatically a correct question-answer pair, legal rule, or hadith judgement.

Each JSONL training example requires: id, task, domain, prompt, target, answerType, evidenceRefs, sourceWorkIds, and reviewStatus (adjudicated or expert-reviewed). Fiqh requires madhhabScope; hadith requires hadithMethodScope.

Keep separate targets for historical transmission, school-consistent derivation, cross-school comparison, hypothetical constructions, and preferred conclusion with its criteria. Do not collapse these into one generic correct-answer label. Preserve disagreement, defeaters, and uncertainty. Keep all chunks from one work in a single data split.
