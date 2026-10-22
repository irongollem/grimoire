#!/usr/bin/env bash
# `supabase start` that waits and tries again when the image registry refuses
# a pull with "toomanyrequests", and fails at once on anything else.
#
# CI pulls the stack's images from ghcr.io (see the database job in
# release.yml), and ghcr.io limits pulls per source IP too. GitHub's runners
# share their IPs, so another repository's burst can refuse ours: on 22 Oct
# 2026 the release of #1090 and #1089 died here three times running, before
# any migration or test ran, and nothing could ship until the limit cleared.
#
# Retries alternate between ghcr.io and the CLI's default registry
# (public.ecr.aws). Each caps pulls per IP on its own, so one refusing us says
# nothing about the other: on 22 Oct ghcr.io stayed shut for four tries in a
# row. ECR has refused us too (30 Sep, see the Edge Function deploy), which is
# why ghcr.io stays first.
#
# Only the rate limit is retried. A migration that fails to replay is a real
# error, and retrying it would just spend minutes before the same red. Images
# that did download stay in Docker's cache, so each attempt pulls less.
set -uo pipefail

attempts=5
log="$(mktemp)"

for attempt in $(seq 1 "$attempts"); do
  # Odd attempts pull from ghcr.io, even ones from the CLI's default.
  if [ $((attempt % 2)) -eq 1 ]; then
    export SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io
  else
    unset SUPABASE_INTERNAL_IMAGE_REGISTRY
  fi
  echo "supabase start, attempt $attempt of $attempts, registry: ${SUPABASE_INTERNAL_IMAGE_REGISTRY:-CLI default}"
  if supabase start 2>&1 | tee "$log"; then
    exit 0
  fi
  if ! grep -q "toomanyrequests" "$log"; then
    echo "::error::supabase start failed, and not on a registry rate limit; not retrying."
    exit 1
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    wait=$((attempt * 45))
    echo "::warning::Image registry rate limit on attempt $attempt of $attempts; retrying in ${wait}s"
    supabase stop --no-backup >/dev/null 2>&1 || true
    sleep "$wait"
  fi
done

echo "::error::supabase start was rate limited by both image registries, $attempts tries in all. Nothing in the change failed; re-run this job once the limit clears."
exit 1
