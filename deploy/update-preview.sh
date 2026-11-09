#!/usr/bin/env bash
# Actualiza la vista previa en el VPS: código nuevo, reconstrucción y verificación.
#
#   cd deploy && bash update-preview.sh
#
# Las migraciones de la base se aplican solas al arrancar la API.
set -euo pipefail
cd "$(dirname "$0")"
DC="docker compose -f compose.preview.yaml --env-file .env.preview"

echo "› Código nuevo…"
git -C .. pull --ff-only

echo "› Reconstruyendo y reiniciando…"
$DC up -d --build

echo "› Esperando a que la API esté sana…"
for i in $(seq 1 60); do
  if [ "$($DC ps --format '{{.Health}}' app)" = "healthy" ]; then
    echo "✓ Actualización completa."
    docker image prune -f >/dev/null   # libera imágenes antiguas
    $DC ps
    exit 0
  fi
  sleep 5
done
echo "✗ La API no quedó sana. Revisa: $DC logs --tail 100 app" >&2
exit 1
