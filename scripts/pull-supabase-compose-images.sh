#!/bin/sh
set -eu

compose() {
  docker compose \
    --env-file supabase/docker/.env \
    -f supabase/docker/docker-compose.yml \
    "$@"
}

# Pull one service at a time. Parallel Compose pulls regularly exhaust the
# anonymous Docker Hub allowance on shared CI runner egress addresses.
for service in $(compose config --services); do
  attempt=1
  while ! compose pull "$service"; do
    if [ "$attempt" -ge 6 ]; then
      echo "Failed to pull $service after $attempt attempts." >&2
      exit 1
    fi

    sleep_seconds=$((attempt * 20))
    echo "Retrying $service in ${sleep_seconds}s (attempt $((attempt + 1))/6)." >&2
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done

  sleep 5
done
