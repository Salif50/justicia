"""Tests de l'import droitguineen (sans réseau ni index) :

    cd model/02_ingestion && ../../backend/env/bin/python -m unittest test_import.py
"""

import unittest

import droitguineen as dg
import import_textes as tx


class NumerosArticles(unittest.TestCase):
    def test_premier_et_bis(self):
        self.assertEqual(dg.norm_num("1er"), "1")
        self.assertEqual(dg.norm_num("premier"), "1")
        self.assertEqual(dg.norm_num("22 bis"), "22-bis")
        self.assertEqual(dg.norm_num("58.3"), "58-3")

    def test_tri_naturel(self):
        nums = ["10", "2", "58-10", "58-3", "100-bis", "100"]
        self.assertEqual(sorted(nums, key=dg.natural_key), ["2", "10", "58-3", "58-10", "100", "100-bis"])


class PageTexteIntegral(unittest.TestCase):
    def test_renvoi_en_debut_de_ligne_ecarte(self):
        body = "Art. 22. Texte A.\n\nArt. 23. Texte B.\n\nArt. 198. renvoi pris pour un titre\n\nArt. 33. Texte C."
        nums = [n for n, _ in dg.split_full_page(body)]
        self.assertEqual(nums, ["22", "23", "33"])

    def test_plage_abrogee_conservee(self):
        body = "Art. 7. Texte.\n\nArt. 8. à 12. - Abrogés.\n\nArt. 13. Texte."   # format réel du CGI
        arts = dict(dg.split_full_page(body))
        self.assertIn("8", arts)
        self.assertTrue(arts["8"].startswith("à 12"))


class NumerosDeTextes(unittest.TestCase):
    def test_cles(self):
        self.assertEqual(tx.numero_key("D/2026/158/PRG/SGG"), ("D", 2026, 158))
        self.assertEqual(tx.numero_key("Loi L/2023/0019/CNT du 25 octobre 2023"), ("L", 2023, 19))
        self.assertEqual(tx.numero_key("U2023/0008/CNT"), ("L", 2023, 8))
        self.assertEqual(tx.numero_key("L/94/006/CTRN"), ("L", 1994, 6))

    def test_emetteur(self):
        self.assertEqual(tx.emetteur("A/2026/029/MMG/SGG"), "MMG")
        self.assertEqual(tx.emetteur("D/2026/158/PRG/SGG"), "PRG")


class Classement(unittest.TestCase):
    def test_familles(self):
        self.assertEqual(tx.classify("Arrêté", "Arrêté A/2022/3835 : Affectation d’un terrain urbain", "", ""), "individuel")
        self.assertEqual(tx.classify("Décret", "Décret D/2023/274 : Promulgation de la loi", "", ""), "promulgation")
        self.assertEqual(tx.classify("Loi", "Loi L/2025/017 : Autorisation de ratification du mémorandum", "", ""), "ratification")
        self.assertEqual(tx.classify("Décret", "Décret D/2022/577 : Attributions et organisation", "", ""), "organisation")
        self.assertEqual(tx.classify("Décret", "Décret fixant les modalités de tenue du registre", "", ""), "reglementaire")
        self.assertEqual(tx.classify("Loi", "Loi L/2024/007 : Orientation agricole", "", "Art. 1. La présente loi…"), "loi")

    def test_coherence_titre_corps(self):
        self.assertFalse(tx.coherent("Arrêté", "Art. 2. La présente Loi entre en vigueur…"))
        self.assertTrue(tx.coherent("Arrêté", "Art. 2. Le présent Arrêté sera publié…"))
        # Loi suivie de son décret de promulgation : cohérent
        self.assertTrue(tx.coherent("Loi", "Art. 3. Le présent Décret portant promulgation de la loi…"))

    def test_intitule_compose(self):
        t = tx.compose_title("Décret", "D/2026/301/PRG/SGG", "2026-10-12", "Fixant les dates des scrutins…")
        self.assertEqual(t, "Décret D/2026/301/PRG/SGG du 12 octobre 2026 — Fixant les dates des scrutins")


if __name__ == "__main__":
    unittest.main()
