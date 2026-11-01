"""Tests unitaires des garde-fous de citation (sans appel LLM)."""

import unittest

from rag import (
    _jurisprudence_section_ok, _split_jurisprudence, _number_decisions,
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


class JurisprudenceGuardTests(unittest.TestCase):
    """La section « Jurisprudence » est retirée au moindre doute (décision inconnue, article inventé)."""

    DECS = [{"passage": "la Cour annule le décret D/2011/017 en application de l'article 49", "decision_id": "x",
             "juridiction": "Cour suprême", "date": "2021-12-02", "numero": "12"}]

    def test_section_valide(self):
        s = "### Jurisprudence\n- Cour suprême, 2 décembre 2021 : la Cour a annulé le décret. 【J1】"
        self.assertTrue(_jurisprudence_section_ok(s, [dict(d) for d in self.DECS]))

    def test_decision_inconnue_rejetee(self):
        s = "### Jurisprudence\n- Une décision. 【J4】"
        self.assertFalse(_jurisprudence_section_ok(s, [dict(d) for d in self.DECS]))

    def test_article_absent_du_passage_rejete(self):
        s = "### Jurisprudence\n- La Cour a appliqué l'article 999. 【J1】"
        self.assertFalse(_jurisprudence_section_ok(s, [dict(d) for d in self.DECS]))

    def test_citation_inexacte_rejetee(self):
        s = "### Jurisprudence\n- La Cour juge que « le décret est valable en toutes circonstances ». 【J1】"
        self.assertFalse(_jurisprudence_section_ok(s, [dict(d) for d in self.DECS]))

    def test_separation_et_numerotation(self):
        main, juris = _split_jurisprudence("### En bref\nRègle. 【S1】\n\n### Jurisprudence\n- Arrêt. 【J1】")
        self.assertNotIn("Jurisprudence", main)
        decs = [dict(d) for d in self.DECS]
        self.assertIn("[J1]", _number_decisions(juris, decs))
        self.assertEqual(decs[0]["_cite_no"], 1)
