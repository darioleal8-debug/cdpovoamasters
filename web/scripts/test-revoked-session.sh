#!/usr/bin/env bash
# Verifica o comportamento do middleware com sessão revogada.
#
# Cenário testado: cookie Auth presente mas sessão inexistente no servidor.
# Resultado esperado: GET /login → 200, Set-Cookie elimina cookies sb-*-auth-token.
# Resultado proibido: qualquer 307 para /dashboard (loop).
#
# Pré-requisitos:
#   - curl, jq (opcional para output formatado)
#   - BASE_URL: URL base da aplicação (local ou produção)
#
# Uso:
#   ./scripts/test-revoked-session.sh https://www.hoophub.pt
#   ./scripts/test-revoked-session.sh http://localhost:3000

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
# Cookie com JWT arbitrário mas formato válido — simula sessão revogada:
# base64url de {"alg":"HS256","typ":"JWT"}.{"sub":"fake-user","exp":9999999999}.<sig>
FAKE_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQiLCJleHAiOjk5OTk5OTk5OTl9.FAKESIG"
FAKE_COOKIE="sb-uhszagzrhdfzpfztuati-auth-token=base64-${FAKE_JWT}"

echo "=== Teste: sessão revogada ==="
echo "BASE_URL: $BASE_URL"
echo ""

# Passo 1: /login com cookie stale — deve devolver 200, não 307
echo "→ GET /login com cookie stale..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" \
  -H "Cookie: $FAKE_COOKIE" \
  --max-redirs 0 \
  "$BASE_URL/login" 2>&1 || true)

HTTP_CODE=$(echo "$RESPONSE" | awk '{print $1}')
REDIRECT_URL=$(echo "$RESPONSE" | awk '{print $2}')

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "  ✓ PASSOU: /login devolveu 200 (sem redirect)"
elif [[ "$HTTP_CODE" == "307" || "$HTTP_CODE" == "302" ]]; then
  echo "  ✗ FALHOU: /login devolveu $HTTP_CODE → $REDIRECT_URL (loop potencial!)"
  exit 1
else
  echo "  ? STATUS $HTTP_CODE (inesperado) → $REDIRECT_URL"
fi

# Passo 2: /dashboard com cookie stale — deve devolver 307 para /login (protegido)
echo ""
echo "→ GET /dashboard com cookie stale..."
RESPONSE2=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" \
  -H "Cookie: $FAKE_COOKIE" \
  --max-redirs 0 \
  "$BASE_URL/dashboard" 2>&1 || true)

HTTP_CODE2=$(echo "$RESPONSE2" | awk '{print $1}')
REDIRECT_URL2=$(echo "$RESPONSE2" | awk '{print $2}')

if [[ "$HTTP_CODE2" == "307" || "$HTTP_CODE2" == "302" ]] && echo "$REDIRECT_URL2" | grep -q "/login"; then
  echo "  ✓ PASSOU: /dashboard devolveu $HTTP_CODE2 → /login"
else
  echo "  ? STATUS $HTTP_CODE2 → $REDIRECT_URL2"
fi

# Passo 3: Verificar que o redirect de /dashboard apaga os cookies
echo ""
echo "→ Verificar Set-Cookie no redirect de /dashboard..."
SET_COOKIE_HEADER=$(curl -s -D - -o /dev/null \
  -H "Cookie: $FAKE_COOKIE" \
  --max-redirs 0 \
  "$BASE_URL/dashboard" 2>&1 | grep -i "set-cookie" || true)

if echo "$SET_COOKIE_HEADER" | grep -q "auth-token.*Max-Age=0\|auth-token.*max-age=0\|auth-token=;"; then
  echo "  ✓ PASSOU: Set-Cookie elimina cookie stale (Max-Age=0)"
elif echo "$SET_COOKIE_HEADER" | grep -q "auth-token"; then
  echo "  ~ INFO: Set-Cookie presente mas verificar se Max-Age=0:"
  echo "    $SET_COOKIE_HEADER"
else
  echo "  ~ INFO: Sem Set-Cookie com auth-token (o middleware pode não ter cookies para limpar com este JWT falso)"
fi

# Passo 4: Sem cookies — /login deve devolver 200
echo ""
echo "→ GET /login sem cookies..."
RESPONSE4=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login" 2>&1 || true)
if [[ "$RESPONSE4" == "200" ]]; then
  echo "  ✓ PASSOU: /login sem cookies devolveu 200"
else
  echo "  ? STATUS $RESPONSE4"
fi

echo ""
echo "=== Fim dos testes ==="
