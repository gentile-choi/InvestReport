/**
 * 데일리 투자보고서 — 시세 자동 수집 스크립트 v2 (GitHub Actions용)
 *
 * 수집 범위 (기술분석 스캔 유니버스):
 *  - 국내주식: 코스피 시가총액 상위 200개 (네이버 순위 수집 시도 → 실패 시 내장 목록)
 *  - 미국주식: 시가총액 상위 200개
 *  - 소수점 가능 ETF: NH증권 소수점 거래 대상(해외 상장) 20개
 *  - 시장 지수 9종
 *
 * 출력: data.json (웹앱이 이 파일로 기술분석 점수를 계산합니다)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; invest-report-collector/2.0)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- 지수 ----------------
const INDICES = ['^KS11', '^KQ11', '^GSPC', '^IXIC', '^DJI', '^VIX', 'KRW=X', 'CL=F', 'GC=F'];

// ---------------- 미국 시총 상위 200 (내장 목록) ----------------
const US200 = [
  'AAPL','MSFT','NVDA','GOOGL','GOOG','AMZN','META','BRK-B','LLY','AVGO',
  'TSM','TSLA','WMT','JPM','V','MA','UNH','XOM','ORCL','PG',
  'HD','COST','JNJ','NFLX','ABBV','BAC','KO','CVX','CRM','AMD',
  'ADBE','LIN','CSCO','TMUS','WFC','MCD','IBM','GE','QCOM','DIS',
  'CAT','VZ','TXN','PFE','AXP','COP','INTU','PM','MS','NOW',
  'RTX','UBER','GS','HON','AMGN','BKNG','UNP','SPGI','NEE','ISRG',
  'PLTR','LOW','ETN','T','BLK','DE','SBUX','SYK','TJX','ADP',
  'PGR','ELV','GILD','C','MMM','MDLZ','VRTX','SCHW','CB','BA',
  'REGN','FI','MO','AMAT','CME','ICE','ZTS','LRCX','MU','KLAC',
  'PANW','SO','DUK','BSX','EQIX','PYPL','TGT','ANET','ABT','DHR',
  'SHOP','SNPS','CDNS','ADI','CRWD','NXPI','MRK','CVS','CI','HCA',
  'CEG','USB','PNC','TMO','GD','LMT','NOC','FDX','UPS','EMR',
  'ITW','PH','WM','RSG','OKE','WMB','KMI','SLB','EOG','MPC',
  'PSX','VLO','FCX','NEM','APD','SHW','ECL','DD','DOW','LYB',
  'NKE','LULU','CMG','YUM','ORLY','AZO','MAR','RCL','CCL','DAL',
  'UAL','LUV','F','GM','RIVN','SNOW','DDOG','NET','TEAM','WDAY',
  'ZS','MELI','NU','SE','COIN','HOOD','XYZ','SPOT','TTD','ROKU',
  'APP','ARM','SMCI','DELL','HPE','NTAP','WDC','STX','ON','MCHP',
  'SWKS','QRVO','MPWR','TER','ASML','FICO','MSCI','COF','SYF','NDAQ',
  'VRSK','GPN','CARR','OTIS','HWM','TDG','VST','NRG','FSLR','ENPH'
];

// ---------------- NH증권 소수점 거래 가능(해외 상장) ETF 20 ----------------
const ETF20 = [
  'VOO','QQQ','SCHD','VGT','VXUS','IWM','DIA','SPY','XLK','XLF',
  'XLV','XLE','XLI','JEPI','VYM','SMH','ARKK','ITOT','GLD','TLT'
];

// ---------------- 코스피 시총 상위권 내장 목록 (네이버 수집 실패 시 폴백) ----------------
const KR_FALLBACK = [
  '005930','005935','000660','373220','207940','005380','267250','012450','068270','105560',
  '035420','055550','005490','006400','051910','012330','011200','003490','033780','035720',
  '402340','017670','096770','066570','000810','032830','003550','000100','000150','034730',
  '030200','015760','034020','009540','042660','010950','078930','010140','004020','023530',
  '293490','036570','259960','036460','003670','047050','016360','001450','088350','005830',
  '011790','011070','009150','034220','051900','028260','028050','006360','000720','012630',
  '006800','008560','071050','001740','001040','097950','004800','298050','267260','267270',
  '042670','079550','047810','161390','018880','204320','073240','004170','069960','139480',
  '111770','000080','000120','011210','009830','032640','037560','090430','002790','095700',
  '086790','024110','175330','138930','060250','323410','377300','001800','001680','002270',
  '006040','007070','008770','021240','030610','035510','049770','002320','057050','071840',
  '100250','103140','108670','047040','375500','011170','011780','086280','005440','016380',
  '192820','128940','001630','000070','004990','251270','000370'
];

// ---------------- 네이버 코스피 시총 순위 시도 ----------------
async function tryNaverKospi200() {
  const codes = [];
  try {
    for (let page = 1; page <= 4; page++) {
      const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page=${page}`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
      if (!r.ok) break;
      const buf = Buffer.from(await r.arrayBuffer());
      const html = new TextDecoder('euc-kr').decode(buf);
      const re = /item\/main\.naver\?code=(\d{6})/g;
      let m;
      while ((m = re.exec(html))) codes.push(m[1]);
      await sleep(500);
    }
  } catch (e) {
    console.log('네이버 수집 실패:', e.message);
  }
  const uniq = [...new Set(codes)];
  console.log('네이버 시총 순위 수집:', uniq.length, '종목');
  return uniq.length >= 100 ? uniq.slice(0, 200) : null;
}

// ---------------- 야후 시세 수집 ----------------
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
      const q0 = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
      const closes = (q0.close || []).filter(x => typeof x === 'number');
      const volumes = (q0.volume || []).filter(x => typeof x === 'number');
      if (!(m.regularMarketPrice > 0) || closes.length < 30) throw new Error('bad data');
      return {
        name: m.longName || m.shortName || sym,
        price: m.regularMarketPrice,
        chg: m.regularMarketChangePercent || 0,
        wk52H: m.fiftyTwoWeekHigh || 0,
        wk52L: m.fiftyTwoWeekLow || 0,
        updated: new Date().toISOString(),
        closes, volumes
      };
    } catch (e) {
      if (a === 2) return null;
      await sleep(1500 * (a + 1));
    }
  }
  return null;
}

// 동시 실행 제한 풀
async function pool(items, limit, worker) {
  let i = 0;
  const results = [];
  const runners = [];
  for (let k = 0; k < Math.min(limit, items.length); k++) {
    runners.push((async function next() {
      while (true) {
        const cur = i++;
        if (cur >= items.length) return;
        results[cur] = await worker(items[cur], cur);
        await sleep(250);
      }
    })());
  }
  await Promise.all(runners);
  return results;
}

// ---------------- 메인 ----------------
const LIMIT = process.env.TEST_LIMIT ? parseInt(process.env.TEST_LIMIT, 10) : 0;

let krCodes = await tryNaverKospi200();
let krSource = 'naver';
if (!krCodes) { krCodes = KR_FALLBACK; krSource = 'fallback'; }
if (LIMIT) {
  krCodes = krCodes.slice(0, Math.max(5, Math.floor(LIMIT / 2)));
}

const groups = {
  kr: krCodes.map(c => c + '.KS'),
  us: LIMIT ? US200.slice(0, LIMIT) : US200,
  etf: LIMIT ? ETF20.slice(0, Math.max(5, Math.floor(LIMIT / 3))) : ETF20
};

let prev = { symbols: {}, indices: {} };
if (existsSync('data.json')) {
  try { prev = JSON.parse(readFileSync('data.json', 'utf8')); } catch (e) { /* 무시 */ }
}

const out = {
  generated: new Date().toISOString(),
  source: 'github-actions-v2',
  krSource,
  indices: {},
  symbols: {},
  groups
};

let ok = 0, total = 0;
const allSyms = INDICES.concat(groups.kr, groups.us, groups.etf);
total = allSyms.length;
console.log(`전체 스캔 대상: ${total}종목 (국내 ${groups.kr.length} / 미국 ${groups.us.length} / ETF ${groups.etf.length} / 지수 ${INDICES.length})`);

const results = await pool(allSyms, 5, async (sym) => {
  const q = await fetchQuote(sym);
  return { sym, q };
});

for (const { sym, q } of results) {
  const isIdx = sym.startsWith('^') || sym.includes('=') || sym.includes('=F');
  const bucket = isIdx ? out.indices : out.symbols;
  if (q) { bucket[sym] = q; ok++; }
  else if (prev && ((isIdx ? prev.indices : prev.symbols) || {})[sym]) {
    bucket[sym] = (isIdx ? prev.indices : prev.symbols)[sym];
    console.log('KEEP(직전 값)', sym);
  } else {
    console.log('FAIL', sym);
  }
}

writeFileSync('data.json', JSON.stringify(out));
console.log(`완료: ${ok}/${total} 최신 수집 → data.json 저장`);
