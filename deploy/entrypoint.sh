#!/bin/sh
set -e

echo "→ Attente de PostgreSQL…"
python - <<'PY'
import os
import sys
import time

import psycopg2

url = os.environ.get("DATABASE_URL_SYNC", "")
if not url:
    print("DATABASE_URL_SYNC manquant", file=sys.stderr)
    sys.exit(1)

for attempt in range(60):
    try:
        conn = psycopg2.connect(url)
        conn.close()
        print("→ PostgreSQL prêt")
        sys.exit(0)
    except Exception as exc:
        if attempt == 0 or attempt % 5 == 0:
            print(f"  pas encore prêt ({exc})")
        time.sleep(1)

print("PostgreSQL injoignable après 60s", file=sys.stderr)
sys.exit(1)
PY

echo "→ Démarrage JusticIA API (1 worker — le RAG charge les modèles en mémoire)"
# --proxy-headers : derrière Caddy, la vraie IP du visiteur vient de X-Forwarded-For
# (indispensable au rate limiting). Seuls Caddy et l'hôte peuvent joindre ce port.
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 \
  --proxy-headers --forwarded-allow-ips "*" --no-server-header
