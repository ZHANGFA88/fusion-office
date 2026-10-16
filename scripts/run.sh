#!/usr/bin/env bash
# Fusion Office 一键启动：主服务 8772 + 蜘蛛舞台 4317（可选，第二参数 --no-spider 跳过）
set -e
cd "$(dirname "$0")/.."
PORT="${FINANCE_PORT:-8772}"
if [ "$1" != "--no-spider" ]; then
  (cd modules/spider && nohup node server.mjs > /tmp/fusion-office-spider.log 2>&1 &) || true
  echo "spider stage → http://127.0.0.1:4317 (log: /tmp/fusion-office-spider.log)"
fi
echo "fusion office → http://127.0.0.1:${PORT}"
FINANCE_PORT="$PORT" python3 scripts/serve.py
