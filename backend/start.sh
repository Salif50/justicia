#!/bin/bash
# Lance le backend JusticIA
source env/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
