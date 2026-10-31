#!/bin/sh
# Writes the configuration of the runtime when the container starts (ADR-20), before nginx. In order:
#   1. a file mounted at /etc/quadrava/runtime-config.json is served as it is;
#   2. otherwise QUADRAVA_REGISTRY_APP selects the definitions published in a registry, with the services of the BFF;
#   3. otherwise the demo with the examples, as built.
# QUADRAVA_BFF_URL adds the paths of the BFF to nginx, so that the browser keeps talking to one origin.
# A wrong value stops the container: a deployment must not start quietly with another configuration.
set -eu

html=/usr/share/nginx/html
target="$html/runtime-config.json"
mounted=/etc/quadrava/runtime-config.json

fail() {
  echo "quadrava: $1" >&2
  exit 1
}

# A name (application, environment, navigation, theme, language): letters, digits, dot, dash, underscore.
name() {
  printf '%s' "$2" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' || fail "$1: not a valid name: $2"
}

# A path of the same origin: the browser talks only to the BFF.
path() {
  printf '%s' "$2" | grep -Eq '^/[A-Za-z0-9._~/-]*$' && ! printf '%s' "$2" | grep -q '^//' || fail "$1: not a path of the same origin: $2"
}

# A comma-separated list of names as a JSON array.
names() {
  list=''
  old_ifs=$IFS
  IFS=','
  for item in $2; do
    item=$(printf '%s' "$item" | tr -d ' ')
    [ -n "$item" ] || continue
    name "$1" "$item"
    list="$list${list:+, }\"$item\""
  done
  IFS=$old_ifs
  [ -n "$list" ] || fail "$1: empty list"
  printf '[%s]' "$list"
}

# Origins of Studio allowed to open this runtime: scheme, host and port only.
origins() {
  list=''
  old_ifs=$IFS
  IFS=','
  for item in $1; do
    item=$(printf '%s' "$item" | tr -d ' ')
    [ -n "$item" ] || continue
    printf '%s' "$item" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' || fail "QUADRAVA_STUDIO_ORIGINS: not an origin: $item"
    list="$list${list:+, }\"$item\""
  done
  IFS=$old_ifs
  printf '[%s]' "$list"
}

if [ -f "$mounted" ]; then
  cp "$mounted" "$target"
  echo "quadrava: configuration from $mounted"
elif [ -n "${QUADRAVA_REGISTRY_APP:-}" ]; then
  app=$QUADRAVA_REGISTRY_APP
  env=${QUADRAVA_REGISTRY_ENV:-production}
  navigation=${QUADRAVA_NAVIGATION:-}
  app_id=${QUADRAVA_APP_ID:-$app}
  [ -n "$navigation" ] || fail "QUADRAVA_NAVIGATION is required with QUADRAVA_REGISTRY_APP"
  name QUADRAVA_REGISTRY_APP "$app"
  name QUADRAVA_REGISTRY_ENV "$env"
  name QUADRAVA_NAVIGATION "$navigation"
  name QUADRAVA_APP_ID "$app_id"
  themes=$(names QUADRAVA_THEMES "${QUADRAVA_THEMES:-light}")
  languages=$(names QUADRAVA_LANGUAGES "${QUADRAVA_LANGUAGES:-en}")
  default_language=${QUADRAVA_DEFAULT_LANGUAGE:-}
  definitions="\"source\": \"registry\", \"app\": \"$app\", \"env\": \"$env\", \"navigation\": \"$navigation\", \"themes\": $themes, \"languages\": $languages"
  if [ -n "$default_language" ]; then
    name QUADRAVA_DEFAULT_LANGUAGE "$default_language"
    definitions="$definitions, \"defaultLanguage\": \"$default_language\""
  fi
  if [ -n "${QUADRAVA_REGISTRY_BASE:-}" ]; then
    path QUADRAVA_REGISTRY_BASE "$QUADRAVA_REGISTRY_BASE"
    definitions="$definitions, \"base\": \"$QUADRAVA_REGISTRY_BASE\""
  fi
  services="\"source\": \"bff\", \"appId\": \"$app_id\""
  if [ -n "${QUADRAVA_TENANT_SWITCH_URL:-}" ]; then
    path QUADRAVA_TENANT_SWITCH_URL "$QUADRAVA_TENANT_SWITCH_URL"
    services="$services, \"tenantSwitchUrl\": \"$QUADRAVA_TENANT_SWITCH_URL\""
  fi
  config="{\n  \"definitions\": { $definitions },\n  \"services\": { $services }"
  if [ -n "${QUADRAVA_STUDIO_ORIGINS:-}" ]; then
    config="$config,\n  \"studio\": { \"origins\": $(origins "$QUADRAVA_STUDIO_ORIGINS") }"
  fi
  printf "$config\n}\n" > "$target"
  echo "quadrava: definitions of $app ($env) from the registry, services through the BFF"
else
  cp /usr/share/nginx/runtime-config.default.json "$target"
  echo "quadrava: demo with the examples"
fi

proxy=/etc/nginx/quadrava/bff.conf
rm -f "$proxy"
if [ -n "${QUADRAVA_BFF_URL:-}" ]; then
  printf '%s' "$QUADRAVA_BFF_URL" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' || fail "QUADRAVA_BFF_URL: scheme, host and port only, not: $QUADRAVA_BFF_URL"
  # The paths of the BFF (contracts/bff.yaml) and of the services it forwards. No buffering: event streams pass as they
  # arrive (ADR-19); the forwarded headers let the BFF build its own addresses (login callback, return check).
  for prefix in /bff/ /logout /oauth2/ /login/oauth2/ /api/ /registry/ /authz/ /telemetry/; do
    cat >> "$proxy" <<EOF
location ^~ $prefix {
    proxy_pass $QUADRAVA_BFF_URL;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$http_host;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 1h;
}
EOF
  done
  echo "quadrava: BFF paths forwarded to $QUADRAVA_BFF_URL"
fi
