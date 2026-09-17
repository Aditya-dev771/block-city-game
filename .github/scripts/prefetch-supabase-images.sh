#!/usr/bin/env bash
set -euo pipefail

profile="${SUPABASE_IMAGE_PROFILE:-runtime}"
cache_dir="/tmp/supabase-image-cache"
archive="${cache_dir}/${profile}.tar"
mkdir -p "${cache_dir}"

if [ "${profile}" = "database" ]; then
  image_map=(
    "public.ecr.aws/supabase/postgres:15.8.1.085|supabase/postgres:15.8.1.085|Supabase Docker Hub postgres mirror"
    "public.ecr.aws/supabase/realtime:v2.130.0|supabase/realtime:v2.130.0|Supabase Docker Hub realtime mirror required by db start schema initialization"
    "public.ecr.aws/supabase/storage-api:v1.72.1|supabase/storage-api:v1.72.1|Supabase Docker Hub storage-api mirror required by db start schema initialization"
    "public.ecr.aws/supabase/gotrue:v2.196.0|supabase/gotrue:v2.196.0|Supabase Docker Hub gotrue mirror required by db start schema initialization"
    "public.ecr.aws/supabase/pg_prove:3.36|supabase/pg_prove:3.36|Supabase Docker Hub pg_prove mirror required by supabase test db"
  )
else
  image_map=(
    "public.ecr.aws/supabase/postgres:15.8.1.085|supabase/postgres:15.8.1.085|Supabase Docker Hub postgres mirror"
    "public.ecr.aws/supabase/gotrue:v2.196.0|supabase/gotrue:v2.196.0|Supabase Docker Hub gotrue mirror"
    "public.ecr.aws/supabase/postgrest:v16.2|postgrest/postgrest:v16.2|PostgREST official Docker Hub image"
    "public.ecr.aws/supabase/kong:2.8.1|kong:2.8.1|Kong official Docker Hub image"
    "public.ecr.aws/supabase/edge-runtime:v1.74.3|supabase/edge-runtime:v1.74.3|Supabase Docker Hub edge-runtime mirror"
    "public.ecr.aws/supabase/pg_prove:3.36|supabase/pg_prove:3.36|Supabase Docker Hub pg_prove mirror required by supabase test db"
  )
fi

retry() {
  local attempt
  for attempt in 1 2 3 4; do
    if "$@"; then
      return 0
    fi
    echo "Command failed on attempt ${attempt}: $*"
    if [ "${attempt}" -eq 4 ]; then
      return 1
    fi
    sleep $((attempt * 10))
  done
}

manifest_digest() {
  docker buildx imagetools inspect "$1" 2>/dev/null | awk '/^Digest:/ { print $2; exit }'
}

echo "Supabase image profile: ${profile}"
echo "Supabase CLI version: ${SUPABASE_CLI_VERSION:-unknown}"
echo "Runner architecture: $(uname -m)"

if [ -s "${archive}" ]; then
  echo "Loading cached Docker images from ${archive}"
  docker load -i "${archive}"
fi

expected_images=()
for entry in "${image_map[@]}"; do
  expected="${entry%%|*}"
  remainder="${entry#*|}"
  mirror="${remainder%%|*}"
  source_note="${entry##*|}"
  expected_images+=("${expected}")

  echo "Image mapping: ${mirror} -> ${expected} (${source_note})"

  mirror_digest="$(manifest_digest "${mirror}" || true)"
  expected_digest="$(manifest_digest "${expected}" || true)"
  if [ -n "${mirror_digest}" ]; then
    echo "Mirror manifest digest for ${mirror}: ${mirror_digest}"
  else
    echo "Mirror manifest digest unavailable for ${mirror}"
  fi
  if [ -n "${expected_digest}" ]; then
    echo "Expected ECR manifest digest for ${expected}: ${expected_digest}"
  else
    echo "Expected ECR manifest digest unavailable for ${expected}; continuing with exact version-tag mirror"
  fi
  if [ -n "${mirror_digest}" ] && [ -n "${expected_digest}" ] && [ "${mirror_digest}" != "${expected_digest}" ]; then
    echo "Digest note: ${mirror} and ${expected} report different registry manifest digests. Using exact upstream version tag from ${source_note}."
  fi

  if docker image inspect "${expected}" >/dev/null 2>&1; then
    echo "Expected image already present: ${expected}"
    continue
  fi

  retry docker pull "${mirror}"
  docker tag "${mirror}" "${expected}"
  docker image inspect "${expected}" >/dev/null
done

echo "Saving Supabase image archive for cache reuse"
docker save "${expected_images[@]}" -o "${archive}"
docker images
