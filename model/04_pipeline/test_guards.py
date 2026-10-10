"""Tests unitaires des garde-fous de citation (sans appel LLM)."""

import unittest

from rag import (
    _replace_source_markers,
    _standalone_retrieval_question,
    _verify_source_markers,
)


class RagGuardTests(unittest.TestCase):
    def setUp(self):
        self.articles = [
            {
                "_source_id": "S1",
                "article_ref": "Art. 1",
                "nom_doc": "Code de test",
            }
        ]

    def test_unknown_source_marker_is_rejected(self):
        self.assertEqual(_verify_source_markers("Fondement 【S2】", self.articles), ["2"])

    def test_source_marker_is_resolved_server_side(self):
        self.assertEqual(
            _replace_source_markers("Fondement 【S1】", self.articles),
            "Fondement (Code de test, Art. 1)",
        )

    def test_follow_up_keeps_previous_user_facts_for_retrieval(self):
        question = _standalone_retrieval_question(
            "Et le délai ?",
            [{"role": "user", "content": "Je veux contester ce licenciement."}],
        )
        self.assertIn("licenciement", question)
        self.assertIn("Et le délai ?", question)


if __name__ == "__main__":
    unittest.main()
