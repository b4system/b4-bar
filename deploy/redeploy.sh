#!/usr/bin/env bash
# Rebuild da imagem + redeploy do stack no Swarm.
# Usado pelo GitHub Actions (push-to-deploy) e tambem manualmente:
#   bash /opt/b4bar/deploy/redeploy.sh
set -euo pipefail

APP_DIR="/opt/b4bar"
cd "$APP_DIR"

echo "[redeploy] $(date '+%F %T') iniciando..."

echo "[redeploy] build da imagem b4bar:latest ..."
docker build -t b4bar:latest .

echo "[redeploy] docker stack deploy ..."
docker stack deploy -c deploy/docker-stack.yml b4bar --resolve-image never

echo "[redeploy] aguardando convergencia do servico app ..."
for i in $(seq 1 30); do
  rep=$(docker service ls --filter name=b4bar_app --format '{{.Replicas}}')
  echo "  app=$rep"
  [ "$rep" = "1/1" ] && break
  sleep 4
done

echo "[redeploy] limpando imagens antigas (dangling) ..."
docker image prune -f >/dev/null 2>&1 || true

echo "[redeploy] $(date '+%F %T') concluido."
