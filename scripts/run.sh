#!/usr/bin/env bash
# Fusion Office 一键启动：主服务 8772 + 蜘蛛新闻喂入器（实时快讯结网，第二参数 --no-spider 跳过）
set -e
cd "$(dirname "$0")/.."
PORT="${FINANCE_PORT:-8772}"
if [ "$1" != "--no-spider" ]; then
  (FINANCE_PORT="$PORT" nohup node scripts/spider_news_feeder.mjs > /tmp/fusion-office-spider.log 2>&1 &) || true
  echo "spider news feeder → live session via /api/fusion/spider-live (log: /tmp/fusion-office-spider.log)"
fi
echo "fusion office → http://127.0.0.1:${PORT}"
FINANCE_PORT="$PORT" python3 scripts/serve.py
