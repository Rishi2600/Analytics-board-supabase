#!/usr/bin/env bash
# Fails if a secret shape reached the built frontend bundle.
#
# The dashboard bundle is public. The anon key belongs there; a service role key or a
# customer's secret API key does not. This runs in CI after every build so a mistake is
# caught by a machine rather than by a reviewer reading a diff.
set -euo pipefail

BUNDLE_DIR="${1:-apps/web/dist}"

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "check-bundle-secrets: no build output at $BUNDLE_DIR. Run the build first." >&2
  exit 1
fi

# service_role   the role name embedded in a Supabase service role JWT
# sk_live_       our own secret project API keys, which are server side only
# sb_secret_     the newer Supabase secret key format
PATTERNS='service_role|sk_live_|sb_secret_'

if grep -rIEl "$PATTERNS" "$BUNDLE_DIR" >/dev/null 2>&1; then
  echo "check-bundle-secrets: FAIL - a secret shape is present in $BUNDLE_DIR" >&2
  grep -rIEl "$PATTERNS" "$BUNDLE_DIR" >&2
  exit 1
fi

echo "check-bundle-secrets: ok - no service role or secret key material in $BUNDLE_DIR"
