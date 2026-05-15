// Vercel Serverless Function - Neon PostgreSQL
// GET  /api/pressure        → 최근 압력 데이터 조회
// POST /api/pressure        → 새 압력 데이터 저장

import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  // 테이블 자동 생성 (첫 실행시)
  await sql`
    CREATE TABLE IF NOT EXISTS pressure_history (
      id        SERIAL PRIMARY KEY,
      ts        BIGINT NOT NULL,
      bp5       NUMERIC,
      bp15      NUMERIC,
      bp1h      NUMERIC,
      weighted  NUMERIC,
      ls        INTEGER,
      ss        INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // GET: 최근 288개 조회 (24시간 × 5분 간격)
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT ts, bp5, bp15, bp1h, weighted, ls, ss
        FROM pressure_history
        ORDER BY ts DESC
        LIMIT 288
      `;
      return res.status(200).json({ ok: true, data: rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // POST: 새 데이터 저장
  if (req.method === 'POST') {
    try {
      const { bp5, bp15, bp1h, weighted, lS, sS, ts } = req.body;
      await sql`
        INSERT INTO pressure_history (ts, bp5, bp15, bp1h, weighted, ls, ss)
        VALUES (
          ${ts || Date.now()},
          ${parseFloat(bp5) || 50},
          ${parseFloat(bp15) || 50},
          ${parseFloat(bp1h) || 50},
          ${parseFloat(weighted) || 50},
          ${parseInt(lS) || 0},
          ${parseInt(sS) || 0}
        )
      `;
      // 오래된 데이터 정리 (288개 초과분 삭제)
      await sql`
        DELETE FROM pressure_history
        WHERE id NOT IN (
          SELECT id FROM pressure_history
          ORDER BY ts DESC
          LIMIT 288
        )
      `;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
