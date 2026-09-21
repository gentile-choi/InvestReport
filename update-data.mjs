/**
 * 데일리 투자보고서 — 시세 자동 수집 스크립트 (GitHub Actions용)
 * 야후 파이낸스에서 지수 9종 + 보유종목 20종의 시세를 수집해 data.json으로 저장합니다.
 * 실패한 종목은 직전 수집값을 유지합니다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const INDICES = ['^KS11', '^KQ11', '^GSPC', '^IXIC', '^DJI', '^VIX', 'KRW=X', 'CL=F', 'GC=F'];
const TICKERS = [
  '005930.KS', '000660.KS', '105560.KS', '012450.KS', '005380.KS',
  '091160.KS', '360750.KS', '133690.KS', '091220.KS', '305540.KS',
  'NVDA', 'GOOGL', 'MSFT', 'TSM', 'LLY',
  'VOO', 'QQQ', 'SCHD', 'VGT', 'VXUS'
];

const UA = 'Mozilla/5.0 (compatible; invest-report-collector/1.0)';

async function fetchQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res) throw new Error('empty');
      const m = res.meta || {};
      const raw = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
      const closes = raw.filter(x => typeof x === 'number');
      if (!(m.regularMarketPrice > 0)) throw new Error('no price');
      return {
        price: m.regularMarketPrice,
        chg: m.regularMarketChangePercent || 0,
        wk52H: m.fiftyTwoWeekHigh || 0,
        wk52L: m.fiftyTwoWeekLow || 0,
        updated: new Date().toISOString(),
        closes: closes
      };
    } catch (e) {
      if (a === 2) return null;
      await new Promise(r => setTimeout(r, 1500 * (a + 1)));
    }
  }
  return null;
}

const all = INDICES.concat(TICKERS);
let prev = { symbols: {} };
if (existsSync('data.json')) {
  try { prev = JSON.parse(readFileSync('data.json', 'utf8')); } catch (e) { /* 무시 */ }
}

const out = { generated: new Date().toISOString(), source: 'github-actions', symbols: {} };
let ok = 0;
for (const sym of all) {
  const q = await fetchQuote(sym);
  if (q) { out.symbols[sym] = q; ok++; console.log('OK  ', sym, q.price); }
  else if (prev.symbols && prev.symbols[sym]) {
    out.symbols[sym] = prev.symbols[sym];
    console.log('KEEP', sym, '(직전 값 유지)');
  } else {
    console.log('FAIL', sym);
  }
  await new Promise(r => setTimeout(r, 700));
}

writeFileSync('data.json', JSON.stringify(out));
console.log(`완료: ${ok}/${all.length} 최신 수집`);
