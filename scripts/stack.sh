#!/usr/bin/env bash
# Control the local Supabase containers.
#
# `supabase stop` and `supabase start` are the correct commands for ending and beginning a
# session, but they are heavier than they look: stop *removes* all twelve containers
# (preserving the three data volumes), so start has to recreate them. Measured on this
# machine that is a 34 second round trip.
#
# Pausing and resuming the existing containers instead takes 10 seconds and 3 seconds. The
# containers keep their identity, the database comes back with its data, and nothing is
# recreated. That is what you want when stepping away for lunch rather than finishing for
# the day.
#
# Containers are matched on the workdir label the CLI stamps on them, rather than on the
# project name, so this keeps working if two checkouts share a directory basename.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILTER="label=com.supabase.cli.workdir=${ROOT}"

running_ids() { docker ps -q --filter "${FILTER}"; }
all_ids() { docker ps -aq --filter "${FILTER}"; }

case "${1:-}" in
  pause)
    ids="$(running_ids)"
    if [ -z "${ids}" ]; then
      echo "Nothing to pause: no running containers for ${ROOT}"
      exit 0
    fi
    # shellcheck disable=SC2086
    docker stop ${ids} >/dev/null
    echo "Paused $(echo "${ids}" | wc -l | tr -d ' ') containers. Resume with: npm run db:resume"
    ;;

  resume)
    ids="$(all_ids)"
    if [ -z "${ids}" ]; then
      echo "No containers exist for ${ROOT}."
      echo "They were removed by 'supabase stop'. Recreate them with: npm run db:start"
      exit 1
    fi
    # shellcheck disable=SC2086
    docker start ${ids} >/dev/null

    # Running is not the same as ready. Kong will accept connections before Postgres is
    # actually serving, so wait for the healthchecks rather than handing back a stack that
    # fails the next command.
    printf 'Starting'
    for _ in $(seq 1 40); do
      pending="$(docker ps --filter "${FILTER}" --format '{{.Status}}' | grep -c 'starting\|unhealthy' || true)"
      [ "${pending}" = "0" ] && break
      printf '.'
      sleep 2
    done
    echo
    echo "Resumed $(running_ids | wc -l | tr -d ' ') containers."
    ;;

  status)
    if [ -z "$(all_ids)" ]; then
      echo "No containers for ${ROOT}. Start them with: npm run db:start"
      exit 0
    fi
    docker ps -a --filter "${FILTER}" \
      --format 'table {{.Names}}\t{{.Status}}' \
      | sed "s/supabase_//; s/_$(basename "${ROOT}")//"
    ;;

  *)
    cat <<'USAGE'
Usage: scripts/stack.sh <pause|resume|status>

  pause    stop the containers without removing them  (fast, keeps data)
  resume   start them again and wait until healthy    (fast)
  status   show every container and its health

For the heavier operations, use the Supabase CLI directly:

  npm run db:start   create and start the stack        (recreates containers)
  npm run db:stop    stop and REMOVE them, keeping the data volumes
  npm run db:reset   drop the database and replay every migration
USAGE
    exit 1
    ;;
esac
