const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.DATABASE_URL) return res.status(500).json({ ok:false, error:'DATABASE_URL not set' });

  try {
    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const now = Date.now();
      const rows = await sql`
        SELECT ts, bp5, bp15, bp1h, weighted, ls, ss
        FROM pressure_history
        ORDER BY ts DESC LIMIT 288
      `;
      if (!rows || rows.length === 0) return res.status(200).json({ ok:true, data:null });

      const ago5m = now-300000, ago15m = now-900000;
      const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
      const r5  = rows.filter(r=>Number(r.ts)>=ago5m).map(r=>parseFloat(r.bp5));
      const r15 = rows.filter(r=>Number(r.ts)>=ago15m).map(r=>parseFloat(r.bp15||r.bp5));
      const r1h = rows.map(r=>parseFloat(r.bp1h||r.bp5));
      const bp5=avg(r5), bp15=avg(r15), bp1h=avg(r1h);
      const fb=bp5??bp15??bp1h??50;
      const weighted=((bp5??fb)*5+(bp15??fb)*3+(bp1h??fb)*2)/10;
      const diff=weighted-50, abs=Math.abs(diff);
      let ls=0,ss=0;
      if(diff>0){if(abs>=20)ls=20;else if(abs>=15)ls=16;else if(abs>=10)ls=12;else if(abs>=5)ls=7;else if(abs>=2)ls=3;}
      else if(diff<0){if(abs>=20)ss=20;else if(abs>=15)ss=16;else if(abs>=10)ss=12;else if(abs>=5)ss=7;else if(abs>=2)ss=3;}
      return res.status(200).json({ ok:true, data:{ bp5:bp5!=null?bp5.toFixed(2):null, bp15:bp15!=null?bp15.toFixed(2):null, bp1h:bp1h!=null?bp1h.toFixed(2):null, weighted:weighted.toFixed(2), ls, ss, count:rows.length } });
    }

    if (req.method === 'POST') {
      const b = req.body||{};
      await sql`INSERT INTO pressure_history (ts,bp5,bp15,bp1h,weighted,ls,ss) VALUES (${Number(b.ts)||Date.now()},${parseFloat(b.bp5)||50},${parseFloat(b.bp15)||50},${parseFloat(b.bp1h)||50},${parseFloat(b.weighted)||50},${parseInt(b.lS)||0},${parseInt(b.sS)||0})`;
      return res.status(200).json({ ok:true });
    }

    return res.status(405).json({ error:'Method not allowed' });
  } catch(e) {
    console.error('pressure error:', e.message);
    return res.status(500).json({ ok:false, error:e.message });
  }
};
