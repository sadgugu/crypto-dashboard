import { neon } from '@neondatabase/serverless';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'];
    const results = [];

    for (const symbol of symbols) {
      try {
        const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=5`);
        const klines = await r.json();
        if (!Array.isArray(klines)||klines.length===0) continue;

        let totalBuy=0, totalVol=0;
        for(const k of klines){ totalVol+=parseFloat(k[5]); totalBuy+=parseFloat(k[9]); }
        const buyPct = totalVol>0 ? (totalBuy/totalVol)*100 : 50;
        const diff=buyPct-50, abs=Math.abs(diff);
        let ls=0,ss=0;
        if(diff>0){if(abs>=20)ls=20;else if(abs>=15)ls=16;else if(abs>=10)ls=12;else if(abs>=5)ls=7;else if(abs>=2)ls=3;}
        else if(diff<0){if(abs>=20)ss=20;else if(abs>=15)ss=16;else if(abs>=10)ss=12;else if(abs>=5)ss=7;else if(abs>=2)ss=3;}

        await sql`
          INSERT INTO pressure_history (ts,bp5,bp15,bp1h,weighted,ls,ss)
          VALUES (${Date.now()},${buyPct.toFixed(2)},${buyPct.toFixed(2)},${buyPct.toFixed(2)},${buyPct.toFixed(2)},${ls},${ss})
        `;
        results.push({ symbol, buyPct:buyPct.toFixed(2), ls, ss });
      } catch(e) { console.error(symbol, e.message); }
    }

    await sql`
      DELETE FROM pressure_history
      WHERE id NOT IN (
        SELECT id FROM pressure_history ORDER BY ts DESC LIMIT 288
      )
    `;

    return res.status(200).json({ ok:true, ts:new Date().toISOString(), results });
  } catch(e) {
    console.error('cron error:', e.message);
    return res.status(500).json({ ok:false, error:e.message });
  }
}
