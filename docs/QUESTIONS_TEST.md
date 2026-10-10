# Questions de test — JusticIA-GN

Questions pour tester le pipeline via l'interface ou `./model/scripts/test_pipeline_ollama.sh` (modèle local Qwen).

---

## Droit du travail

1. Quels sont les droits d'un employé licencié sans motif valable en Guinée ?
2. Quelle est la durée légale du préavis pour un CDI en Guinée ?
3. Comment calculer les indemnités de licenciement selon le Code du travail guinéen ?
4. Quelles sont les conditions pour qu'une grève soit légale en Guinée ?
5. Une femme enceinte peut-elle être licenciée en Guinée ? Que dit la loi ?

---

## Droit pénal

6. Quelle est la peine prévue pour le vol avec violence en droit guinéen ?
7. Qu'est-ce que la légitime défense selon le Code pénal guinéen ?
8. Quelles sont les conditions pour qu'une détention provisoire soit légale en Guinée ?
9. Quelle est la durée de prescription pour un crime en Guinée ?
10. Quels sont les droits d'un suspect lors d'une garde à vue en Guinée ?

---

## Droit foncier

11. Comment acquérir légalement un terrain en Guinée ? Quelles sont les étapes ?
12. Qu'est-ce que le titre foncier et comment l'obtenir en Guinée ?
13. Quels sont les droits d'un locataire en cas d'expulsion abusive en Guinée ?
14. Comment fonctionne l'expropriation pour utilité publique en Guinée ?
15. Un terrain coutumier peut-il être vendu légalement en Guinée ?

---

## Droit de la famille

16. Quelles sont les conditions légales pour se marier en Guinée ?
17. Comment fonctionne le divorce en Guinée ? Quelles en sont les causes légales ?
18. Qui a la garde des enfants après un divorce selon le droit guinéen ?
19. Comment est calculée la pension alimentaire en Guinée ?
20. Quels sont les droits d'un enfant naturel en matière de succession en Guinée ?

---

## Droit commercial

21. Quelles sont les formalités pour créer une SARL en Guinée ?
22. Qu'est-ce que l'OHADA et comment s'applique-t-il en Guinée ?
23. Quelles sont les obligations d'un commerçant en Guinée ?
24. Comment fonctionne la procédure de faillite d'une entreprise en Guinée ?
25. Quelles sont les règles concernant les chèques sans provision en Guinée ?

---

## Questions de suivi (tester la mémoire de conversation)

> Poser ces questions **dans la même conversation**, dans l'ordre :

26. *(1re question)* Quelles sont les causes légales de divorce en Guinée ?
27. *(2e question)* Et quels sont les délais de procédure ?
28. *(3e question)* Dans ce cas, qui garde les enfants en bas âge ?
29. *(4e question)* Peux-tu me résumer tout ce qu'on vient de voir ?

---

## Questions difficiles (hallucination test)

> Ces questions testent si le modèle **invente** ou admet honnêtement ses limites :

30. Quel est l'article 999 du Code civil guinéen ?
31. Que dit la loi guinéenne sur les cryptomonnaies ?
32. Quelle est la peine pour le cyber-harcèlement en Guinée ?

> **Réponse attendue** : Le modèle doit dire qu'il ne trouve pas l'article ou que la loi n'existe pas encore, sans inventer.

---

## Comment tester directement via Ollama

```bash
ollama run qwen2.5:14b
# Puis taper la question directement dans le terminal
```

## Comment tester via l'API backend

```bash
curl -X POST http://localhost:8000/api/conversation/send \
  -H "Authorization: Bearer <votre_token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "Quels sont les droits dun employe licencie en Guinee ?", "agent_id": "travail"}'
```
