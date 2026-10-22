#!/usr/bin/env bash
# Raw JSON-RPC calls against the MCP endpoint. Usage: ./examples/curl.sh
# Reads ACCOUNT_INTEL_API_KEY from the environment or from .env.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -z "${ACCOUNT_INTEL_API_KEY:-}" && -f .env ]] && set -a && source .env && set +a

URL="${MCP_URL:-http://localhost:3100/mcp}"
rpc() {
  curl -sS "$URL" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "Authorization: Bearer ${ACCOUNT_INTEL_API_KEY}" \
    -d "$1"
  echo
}

echo '# Unauthenticated request (expect HTTP 401)'
curl -sS -o /dev/null -w '%{http_code}\n' "$URL" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

echo '# tools/list'
rpc '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

echo '# search_companies'
rpc '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_companies","arguments":{"query":"AI companies","country":"Australia","limit":3}}}'

echo '# get_company'
rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_company","arguments":{"companyId":"cmp_1"}}}'
