#!/usr/bin/env bash
# Copyright (C) 2023-2026 QuantumNous
# SPDX-License-Identifier: AGPL-3.0-or-later

set -Eeuo pipefail
umask 077

service_url="${1:-}"
if [[ ! "$service_url" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "错误：缺少有效的服务地址，请从平台文档页复制完整命令。" >&2
  exit 1
fi

if [ ! -r /dev/tty ]; then
  echo "错误：无法读取交互式终端。" >&2
  exit 1
fi

service_url="${service_url%/}"
if [[ "$service_url" == */v1 ]]; then
  api_base_url="$service_url"
else
  api_base_url="$service_url/v1"
fi

read_secret() {
  local prompt="$1" value
  printf '%s: ' "$prompt" >/dev/tty
  IFS= read -r -s value </dev/tty || true
  printf '\n' >/dev/tty
  printf '%s' "$value"
}

shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

toml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

upsert_shell_export() {
  local rc_file="$1" key="$2" value="$3" quoted_value temp_file
  quoted_value="$(shell_quote "$value")"
  temp_file="$(mktemp)"
  if [ -f "$rc_file" ]; then
    awk -v key="$key" '
      $0 !~ "^[[:space:]]*(export[[:space:]]+)?" key "=" { print }
    ' "$rc_file" >"$temp_file"
  fi
  printf 'export %s=%s\n' "$key" "$quoted_value" >>"$temp_file"
  mkdir -p "$(dirname "$rc_file")"
  cat "$temp_file" >"$rc_file"
  rm -f "$temp_file"
}

codex_dir="$HOME/.codex"
config_file="$codex_dir/config.toml"
model="gpt-6-astra"

echo "=== Codex 一键配置工具 ==="
echo "服务地址已自动设置为：$api_base_url"
echo "默认模型已设置为：$model（可在 Codex 中使用 /model 切换）"
echo

api_key="$(read_secret "请输入平台 API 密钥")"
api_key="$(printf '%s' "$api_key" | tr -d '\r\n')"
if [ -z "$api_key" ]; then
  echo "错误：API 密钥不能为空。" >&2
  exit 1
fi

mkdir -p "$codex_dir"
if [ -f "$config_file" ]; then
  backup_file="$config_file.backup.$(date +%Y%m%d%H%M%S)"
  cp "$config_file" "$backup_file"
  echo "已备份原配置：$backup_file"
fi

cat >"$config_file" <<EOF
model = "$(toml_escape "$model")"
model_provider = "newapi"

[model_providers.newapi]
name = "New API"
base_url = "$(toml_escape "$api_base_url")"
env_key = "NEW_API_KEY"
wire_api = "responses"
EOF

upsert_shell_export "$HOME/.bashrc" "NEW_API_KEY" "$api_key"
upsert_shell_export "$HOME/.zshrc" "NEW_API_KEY" "$api_key"
chmod 700 "$codex_dir"
chmod 600 "$config_file" "$HOME/.bashrc" "$HOME/.zshrc"

echo
echo "✅ Codex 配置完成"
echo "  模型：$model"
echo "  API 地址：$api_base_url"
echo "  配置文件：$config_file"
echo "请重新打开终端，或执行 source ~/.zshrc（zsh）/ source ~/.bashrc（bash）后运行 codex。"
