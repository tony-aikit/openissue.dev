#!/usr/bin/env bash
# Idempotently prepare a self-contained local dev configuration for OpenIssue.dev.
#
# Creates .env.local (if missing) pointing at a local libSQL file database and
# generated development secrets, then applies the SQL migrations to that database
# exactly once. Real values provided via Cloud Agent Secrets (process env vars)
# take precedence over .env.local at runtime, so this never overrides secrets.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DATA_DIR="${OPENISSUE_DATA_DIR:-$HOME/.openissue}"
DB_FILE="$DATA_DIR/local.db"
ENV_FILE="$REPO_ROOT/.env.local"

mkdir -p "$DATA_DIR"

gen_secret() {
  # 48 hex chars (>= 32 chars) using node's crypto, avoiding external tools.
  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE with local development defaults..."
  cat > "$ENV_FILE" <<EOF
# Auto-generated local development configuration for Cloud Agent.
# Safe local defaults; override any value by setting a real Cloud Agent Secret.
# GITHUB_TOKEN is optional: without it, issue search uses the unauthenticated
# GitHub API (lower rate limits). Add it as a Secret to raise limits.
GITHUB_TOKEN=
TURSO_DATABASE_URL=file:$DB_FILE
TURSO_AUTH_TOKEN=local-dev-placeholder
BETTER_AUTH_SECRET=$(gen_secret)
BETTER_AUTH_URL=http://localhost:3000
OAUTH_PROXY_SECRET=$(gen_secret)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
CRON_SECRET=$(gen_secret)
SMTP_USER=
SMTP_APP_PASSWORD=
DIGEST_FROM_EMAIL=OpenIssue.dev <openissue.project@example.com>
EOF
else
  echo "$ENV_FILE already exists; leaving it untouched."
fi

# Resolve the database file the app will actually use. Prefer an explicit
# TURSO_DATABASE_URL from the environment (a Cloud Agent Secret); otherwise use
# the value written into .env.local above.
RESOLVED_DB_URL="${TURSO_DATABASE_URL:-}"
if [ -z "$RESOLVED_DB_URL" ]; then
  RESOLVED_DB_URL="$(grep -E '^TURSO_DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
fi

# Only initialize a local file-based database. A remote Turso URL is managed
# externally and must not be migrated from here.
case "$RESOLVED_DB_URL" in
  file:*)
    LOCAL_DB_PATH="${RESOLVED_DB_URL#file:}"
    if [ ! -f "$LOCAL_DB_PATH" ]; then
      echo "Initializing local database at $LOCAL_DB_PATH and applying migrations..."
      TURSO_DATABASE_URL="$RESOLVED_DB_URL" node "$REPO_ROOT/.cursor/apply-migrations.mjs"
    else
      echo "Local database already present at $LOCAL_DB_PATH; skipping migrations."
    fi
    ;;
  *)
    echo "Non-file TURSO_DATABASE_URL detected; skipping local database initialization."
    ;;
esac
