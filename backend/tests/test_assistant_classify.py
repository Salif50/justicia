"""Classement par règles des messages du chat (sans appel LLM) :

    cd backend && env/bin/python -m unittest tests/test_assistant_classify.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import assistant  # noqa: E402

CASES = {
    # Une dette n'est pas une question sur l'abonnement (« payer » seul était classé « tarifs »)
    "Un client refuse de payer ma facture, comment récupérer mon argent ?": "legal",
    "Je dois payer une amende, que faire ?": "legal",
    "Mon patron ne me paie pas": "legal",
    "Qu'est-ce que la redevance de conformité numérique ?": "legal",
    "Combien coûte l'abonnement ?": "about",
    "Comment payer mon abonnement par Orange Money ?": "about",
    "Quels sont vos tarifs ?": "about",
    "Qui es-tu ?": "about",
    "Bonjour": "greeting",
}


class ClassificationParRegles(unittest.TestCase):
    def test_cas(self):
        for message, attendu in CASES.items():
            with self.subTest(message=message):
                self.assertEqual(assistant.classify(message), attendu)


class DateDuJour(unittest.TestCase):
    def test_contexte_date(self):
        ctx = assistant._today_context()
        self.assertIn("Date du jour", ctx)
        self.assertIn("pas des textes « futurs »", ctx)


if __name__ == "__main__":
    unittest.main()
