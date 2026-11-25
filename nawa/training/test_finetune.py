import unittest
from finetune_lora import split_examples_by_source_works, validate_inputs, format_example

class FineTuneSafetyTests(unittest.TestCase):
    def setUp(self):
        self.corpus=[{"id":"c1","work":{"id":"w1","title":"كتاب أ","author":"مؤلف","licenseStatus":"public-domain","licenseEvidence":"catalog record"},"content":"نص موثق","locator":{"pageStart":12}}]
        self.example={"id":"e1","task":"grammar","domain":"language","prompt":"حلل","target":"جواب","answerType":"inference","evidenceRefs":["c1"],"sourceWorkIds":["w1"],"reviewStatus":"expert-reviewed"}
    def test_source_work_components_never_leak_between_splits(self):
        rows=[dict(self.example,id="e1",sourceWorkIds=["w1"]),dict(self.example,id="e2",sourceWorkIds=["w1","w2"]),dict(self.example,id="e3",sourceWorkIds=["w2"]),dict(self.example,id="e4",sourceWorkIds=["w3"])]
        split=split_examples_by_source_works(rows)
        owner={}
        for bucket,items in split.items():
            for row in items:
                for work in row["sourceWorkIds"]:
                    self.assertNotIn(work,owner)
                    owner[work]=bucket
        self.assertEqual(owner["w1"],owner["w2"])
    def test_formatting_includes_exact_source_and_locator(self):
        formatted=format_example(self.example,{"c1":self.corpus[0]})
        self.assertIn("[المصدر c1]",formatted["prompt"])
        self.assertIn("كتاب أ",formatted["prompt"])
        self.assertIn("12",formatted["prompt"])
        self.assertEqual(formatted["target"],"جواب")
    def test_unresolved_rights_block_training(self):
        bad=[dict(self.corpus[0],work={**self.corpus[0]["work"],"licenseStatus":"unknown"})]
        with self.assertRaisesRegex(ValueError,"unresolved rights"):
            validate_inputs(bad,[self.example])
    def test_source_reference_mismatch_blocks_training(self):
        bad=dict(self.example,sourceWorkIds=["other-work"])
        with self.assertRaisesRegex(ValueError,"Unknown source work"):
            validate_inputs(self.corpus,[bad])
    def test_reviewed_and_cited_example_passes_preflight(self):
        self.assertIn("c1",validate_inputs(self.corpus,[self.example]))

if __name__=="__main__":
    unittest.main()
