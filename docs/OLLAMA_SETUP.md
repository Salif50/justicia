# Modèle local (Qwen 2.5 via Ollama)

JusticIA rédige ses réponses avec un modèle de langage **sans entraînement spécifique** :
le moteur RAG lui fournit les articles de loi retrouvés, et un garde-fou vérifie que chaque
citation correspond à une source réellement fournie. On peut donc changer de modèle sans
rien réentraîner.

Par défaut le projet utilise OpenAI (GPT-4o). Le modèle local sert à **basculer**
quand on veut que rien ne sorte de la machine.

| | OpenAI GPT-4o | Qwen 2.5 14B local |
|---|---|---|
| Confidentialité | Questions envoyées à OpenAI (USA) | 100 % local |
| Vitesse (Mac) | ~10 s | ~1–2 min |
| Coût | Payant à l'usage | Gratuit (machine) |
| Production (VPS actuel) | ✅ | ❌ (nécessite GPU ou beaucoup de RAM) |

## Installer

```bash
brew install ollama          # ou https://ollama.com
ollama pull qwen2.5:14b      # ~9 Go
ollama list                  # doit afficher qwen2.5:14b
```

## Basculer

Dans `backend/.env` :

```env
LLM_PROVIDER=ollama
RAG_LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:14b
RAG_OLLAMA_MODEL=qwen2.5:14b
OLLAMA_BASE_URL=http://localhost:11434
```

Redémarrer le backend, puis vérifier : `curl http://localhost:8000/health`
→ `"llm": {"provider": "ollama", "local": true, …}`.

Revenir à OpenAI : remettre `LLM_PROVIDER=openai` et `RAG_LLM_PROVIDER=openai`.

## Tester

```bash
./model/scripts/test_pipeline_ollama.sh     # questions juridiques de bout en bout
```

Vérifié le 10 octobre 2026 : Qwen 2.5 14B répond correctement à « période d'essai d'un
cadre » (Art. 121.6 du Code du travail cité intégralement), passe le contrôle de citation,
en ~90 s sur Mac.

## Pourquoi pas de fine-tuning

Abandonné en octobre 2026 : pour un assistant qui doit citer la loi exacte, la fiabilité
vient de la recherche (RAG) et de la vérification des sources, pas de la mémoire du
modèle. Un modèle entraîné sur les textes peut inventer un numéro d'article plausible et
devient obsolète à chaque changement de loi, alors qu'une réindexation prend quelques minutes.
