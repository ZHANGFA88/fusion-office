#!/usr/bin/env node
/**
 * Fusion Office · 蜘蛛新闻喂入器（2026-10-16）
 * 把 FinSight 财经快讯（/api/finance/news，东财/新浪双源）实时推给 prompt-spider-ui：
 * 用蜘蛛自带的 SessionStore + PreviewHub 开一个 landscape 任务会话，
 * 每条新快讯 = 一个事件（标题为 label，详情含时间与原文链接），蜘蛛在横屏蛛网上实时结网。
 * 预览地址（带令牌）写到 data/spider-live.json，供 serve.py /api/fusion/spider-live 与蜘蛛分室消费。
 * 零第三方依赖（只用蜘蛛自带 lib 与 Node 内置模块），不需要 npm ci、不需要 MCP SDK。
 */
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SessionStore } from '../modules/spider/lib/session-store.js';
import { normalizeConfig } from '../modules/spider/lib/config.js';
import { createPreviewHub } from '../modules/spider/mcp/hub.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SPIDER_ROOT = path.join(ROOT, 'modules', 'spider');
const DATA_DIR = path.join(ROOT, 'data');
const LIVE_FILE = path.join(DATA_DIR, 'spider-live.json');
const SEEN_FILE = path.join(DATA_DIR, 'spider-seen.json');
const PORT = process.env.FINANCE_PORT || '8772';
const NEWS_URL = process.env.NEWS_URL || `http://127.0.0.1:${PORT}/api/finance/news`;
const POLL_MS = Number(process.env.SPIDER_POLL_MS || 45000);
const ROTATE_AT = 4000;         // 单会话事件上限前主动轮换（上限 10000）
const INITIAL_PUSH = 15;        // 首轮最多推最近 15 条，避免开局刷屏

fs.mkdirSync(DATA_DIR, { recursive: true });

const store = new SessionStore();
const hub = createPreviewHub({ store, root: SPIDER_ROOT });

const SESSION_CONFIG = normalizeConfig({
  title: '财经快讯 · 实时',
  subtitle: 'FinSight 快讯（东财/新浪）→ 蜘蛛网 · 点任意节点看详情与原文链接',
  modelName: 'Fusion News Feeder',
  layout: 'landscape',
  unit: 'task',
  routes: {
    code: { label: '市场动态' },
    model: { label: '公司行业' },
    you: { label: '宏观政策' },
  },
});

const MACRO = /央行|国务院|发改委|证监会|财政部|工信部|统计局|商务部|利率|降准|降息|加息|GDP|CPI|PPI|政策|监管|新规|办法|通知|意见|规划/;
const MARKET = /指数|收盘|开盘|涨停|跌停|成交额|成交量|沪指|深成指|创业板|科创50|板块|ETF|北向|南向|期货|期指|原油|黄金|白银|汇率|人民币|美元|比特币|以太坊|港股|美股|A股|大盘|涨幅|跌幅/;
function classify(title) {
  if (MACRO.test(title)) return 'you';
  if (MARKET.test(title)) return 'code';
  return 'model';
}
const eid = url => 'n' + createHash('sha1').update(url || '').digest('hex').slice(0, 16);

let seen = new Set();
try { seen = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))); } catch { /* 首次运行 */ }
function persistSeen() {
  try { fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen].slice(-2000))); } catch { /* 写失败不致命 */ }
}

let sessionId = null;
function openSession() {
  const snap = store.create(SESSION_CONFIG);
  sessionId = snap.id;
  writeLive();
  console.log(`[spider-feeder] session ${sessionId} opened`);
}
function writeLive() {
  const payload = { ok: true, url: hub.previewUrl(sessionId), session_id: sessionId, updated: Date.now() };
  const tmp = LIVE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, LIVE_FILE);
}

async function poll(first = false) {
  try {
    const resp = await fetch(NEWS_URL, { signal: AbortSignal.timeout(20000) });
    const data = await resp.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const fresh = items.filter(it => it && it.title && it.url && !seen.has(eid(it.url)));
    fresh.reverse(); // 接口是新→旧，反转后按时间顺序结网
    const batch = first ? fresh.slice(-INITIAL_PUSH) : fresh;
    if (batch.length) {
      const events = batch.map(it => ({
        id: eid(it.url),
        label: String(it.title).slice(0, 200),
        route: classify(it.title),
        status: 'completed',
        detail: `${it.time || ''} · 财经快讯\n原文链接：${it.url}`,
        occurredAt: it.time || null,
      }));
      store.updateEvents(sessionId, events.slice(0, 100));
      for (const it of fresh) seen.add(eid(it.url));
      persistSeen();
      console.log(`[spider-feeder] pushed ${Math.min(events.length, 100)} headlines (total ${store.get(sessionId).totalEvents})`);
    }
    if (store.get(sessionId).totalEvents >= ROTATE_AT) {
      try { store.complete(sessionId, 'completed'); store.close(sessionId); } catch { /* 已关则忽略 */ }
      openSession();
      console.log('[spider-feeder] session rotated');
    }
  } catch (err) {
    console.error('[spider-feeder] poll failed:', err.message);
  }
  writeLive(); // 心跳：更新 updated 时间戳
}

const origin = await hub.start();
console.log(`[spider-feeder] hub at ${origin} · news=${NEWS_URL} · poll=${POLL_MS}ms`);
openSession();
await poll(true);
setInterval(() => { void poll(false); }, POLL_MS);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, async () => { try { await hub.close(); } finally { process.exit(0); } });
}
