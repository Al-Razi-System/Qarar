#!/bin/sh
set -eu

compose() {
  docker compose \
    --env-file supabase/docker/.env \
    -f supabase/docker/docker-compose.yml \
    "$@"
}

# Other registries where the publisher keeps the same image, in the order to
# try them. Shared CI runners exhaust the anonymous data allowance of
# public.ecr.aws and Docker Hub ("toomanyrequests: Data limit exceeded");
# ghcr.io serves the same images to GitHub's own runners without it.
mirrors_for() {
  case "$1" in
    public.ecr.aws/supabase/logflare:*) echo "docker.io/supabase/logflare:${1##*:}" ;; # not on ghcr.io
    public.ecr.aws/supabase/*) echo "ghcr.io/supabase/${1#public.ecr.aws/supabase/} docker.io/supabase/${1#public.ecr.aws/supabase/}" ;;
    supabase/*|axllent/*) echo "ghcr.io/$1" ;;
  esac
}

# The manifest digest the compose file's own registry publishes for the tag,
# read with a HEAD request: it returns the digest without the manifest body,
# so it does not draw on the data allowance that the pull would exhaust.
source_digest() {
  ref="$1"
  case "$ref" in
    public.ecr.aws/*)
      rest="${ref#public.ecr.aws/}"
      token_url="https://public.ecr.aws/token/?scope=repository:${rest%:*}:pull"
      manifest_url="https://public.ecr.aws/v2/${rest%:*}/manifests/${rest##*:}" ;;
    */*:*)
      token_url="https://auth.docker.io/token?service=registry.docker.io&scope=repository:${ref%:*}:pull"
      manifest_url="https://registry-1.docker.io/v2/${ref%:*}/manifests/${ref##*:}" ;;
    *) return 0 ;;
  esac
  token="$(curl -fsS "$token_url" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')" || return 0
  [ -n "$token" ] || return 0
  curl -fsSI -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json" \
    "$manifest_url" | tr -d '\r' | sed -n 's/^[Dd]ocker-[Cc]ontent-[Dd]igest: *\(sha256:[0-9a-f]\{64\}\)$/\1/p'
}

# Pulls the mirror copy and names it as the compose file does, so `up --pull
# never` and the isolated browser stack find it. The mirror is pulled by the
# source registry's digest, so its content is exactly the image the compose
# file names; if that digest cannot be read, the mirror's tag is used instead.
pull_from_mirror() {
  image="$1"
  mirrors="$(mirrors_for "$image")"
  [ -n "$mirrors" ] || return 1
  digest="$(source_digest "$image" || true)"
  [ -n "$digest" ] || echo "Could not read the digest of $image; using the mirrors' tag." >&2
  for mirror in $mirrors; do
    if [ -n "$digest" ]; then reference="${mirror%:*}@$digest"; else reference="$mirror"; fi
    if docker pull "$reference"; then
      docker tag "$reference" "$image"
      echo "Pulled $image from $reference."
      return 0
    fi
    echo "Could not pull $reference; trying the next source." >&2
  done
  return 1
}

# The compose file's own registry, one image at a time. Parallel pulls
# regularly exhaust the anonymous allowance on shared runner addresses.
pull_from_source() {
  image="$1"
  attempt=1
  while ! docker pull "$image"; do
    if [ "$attempt" -ge 6 ]; then
      echo "Failed to pull $image after $attempt attempts." >&2
      return 1
    fi
    sleep_seconds=$((attempt * 20))
    echo "Retrying $image in ${sleep_seconds}s (attempt $((attempt + 1))/6)." >&2
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done
}

# Sourcing with QARAR_PULL_LIB_ONLY=1 loads the functions for tests.
if [ "${QARAR_PULL_LIB_ONLY:-}" = 1 ]; then return 0 2>/dev/null || exit 0; fi

for image in $(compose config --images | sort -u); do
  if docker image inspect "$image" >/dev/null 2>&1; then
    echo "$image is already present."
  elif ! pull_from_mirror "$image"; then
    pull_from_source "$image"
  fi
  sleep 2
done
