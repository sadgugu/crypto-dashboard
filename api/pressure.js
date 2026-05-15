import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  // GET: symbol별 5분/15분/1시간 평균 반환
  if (req.method === 'GET') {
    try {
      const symbol = req.query?.symbol || 'BTCUSDT';
      const now = Date.now();
      const ago5m  = now - 5 * 60 * 1000;
      const ago15m = now - 15 * 60 * 1000;
      const ago1h  = now - 60 * 60 * 1000;

      const rows = await sql`
        SELECT ts, buy_pct, ls, ss
        FROM pressure_history
        WHERE symbol = ${symbol}
          AND ts >= ${ago1h}
        ORDER BY ts DESC
        LIMIT 288
      `;

      if (!rows || rows.length === 0) {
        return res.status(200).json({ ok: true, data: null, message: 'No data yet' });
      }

      const avg = (arr) => arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 50;

      const r5m  = rows.filter(r => r.ts >= ago5m).map(r => parseFloat(r.buy_pct));
      const r15m = rows.filter(r => r.ts >= ago15m).map(r => parseFloat(r.buy_pct));
      const r1h  = rows.map(r => parseFloat(r.buy_pct));

      const bp5  = r5m.length  ? avg(r5m)  : null;
      const bp15 = r15m.length ? avg(r15m) : null;
      const bp1h = r1h.length  ? avg(r1h)  : null;

      // 가중 평균: 5분(5) + 15분(3) + 1시간(2)
      const fb = bp5 ?? bp15 ?? bp1h ?? 50;
      const weighted = ((bp5 ?? fb)*5 + (bp15 ?? fb)*3 + (bp1h ?? fb)*2) / 10;
      const diff = weighted - 50;
      const abs = Math.abs(diff);

      let ls = 0, ss = 0;
      if (diff > 0) {
        if (abs >= 20) ls = 20;
        else if (abs >= 15) ls = 16;
        else if (abs >= 10) ls = 12;
        else if (abs >= 5)  ls = 7;
        else if (abs >= 2)  ls = 3;
      } else if (diff < 0) {
        if (abs >= 20) ss = 20;
        else if (abs >= 15) ss = 16;
        else if (abs >= 10) ss = 12;
        else if (abs >= 5)  ss = 7;
        else if (abs >= 2)  ss = 3;
      }

      return res.status(200).json({
        ok: true,
        data: {
          bp5:  bp5  ? bp5.toFixed(2)  : null,
          bp15: bp15 ? bp15.toFixed(2) : null,
          bp1h: bp1h ? bp1h.toFixed(2) : null,
          weighted: weighted.toFixed(2),
          ls, ss,
          count: rows.length,
          ts: Date.now()
        }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // POST: 수동 저장 (브라우저에서 호출시 fallback)
  if (req.method === 'POST') {
    try {
      const { bp5, bp15, bp1h, weighted, lS, sS, ts } = req.body;

      await sql`
        CREATE TABLE IF NOT EXISTS pressure_history (
          id SERIAL PRIMARY KEY, ts BIGINT NOT NULL,
          symbol VARCHAR(20) DEFAULT 'BTCUSDT',
          buy_vol NUMERIC, sell_vol NUMERIC,
          buy_pct NUMERIC, weighted NUMERIC,
          ls INTEGER DEFAULT 0, ss INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;

      await sql`
        INSERT INTO pressure_history (ts, symbol, buy_pct, weighted, ls, ss)
        VALUES (
          ${ts || Date.now()}, 'BTCUSDT',
          ${parseFloat(bp5) || 50},
          ${parseFloat(weighted) || 50},
          ${parseInt(lS) || 0},
          ${parseInt(sS) || 0}
        )
      `;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
