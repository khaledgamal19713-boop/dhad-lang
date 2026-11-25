# Scholarly rule representation
Rules are versioned, source-backed objects, not untraceable prompts. Each rule records its discipline, rule type, school/method scope, premises, exceptions, conclusion, epistemic status, originating work, and evidence chunk IDs.

The evaluator returns applicability, defeated rules, unavailable evidence, and conflicts. It deliberately never emits a final verdict. It does not infer that an old scholar held a position unless the cited source establishes that attribution. Hypothetical derivations must be labeled as such.

All domains inspect the same case object. Domain-specific scope is used to filter applicability, not to isolate the evidence or the case.
