// scripts/fetchBoard.mjs
// Fetches PropLine /v1/ev and /v1/odds, logs remaining daily quota, and writes data/props.json

import fs from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.PROPLINE_API_KEY;
const BASE_URL = process.env.PROPLINE_BASE_URL || 'https://api.propline.com/v1';
const SPORTS = ['nfl', 'nba'];

async function fetchPropLine(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json'
    }
  });

  const remaining = res.headers.get('x-daily-remaining');
  const used = res.headers.get('x-daily-used');
  if (remaining) {
    console.log(`[PropLine Quota] Used: ${used} | Remaining Today: ${remaining}`);
  }

  if (!res.ok) {
    throw new Error(`PropLine API Error (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

function americanToDecimal(american) {
  if (!american) return 1.91;
  if (american > 0) return Number(((american / 100) + 1).toFixed(2));
  return Number(((100 / Math.abs(american)) + 1).toFixed(2));
}

async function run() {
  if (!API_KEY) {
    console.error('Missing PROPLINE_API_KEY environment variable.');
    process.exit(1);
  }

  const normalizedProps = [];

  for (const sport of SPORTS) {
    try {
      const payload = await fetchPropLine(`/ev?sport=${sport}&include_trends=true`);
      const items = payload.data || payload.props || [];

      for (const item of items) {
        const books = item.books || [item.best_book || item.book].filter(Boolean);

        for (const b of books) {
          normalizedProps.push({
            prop_id: `${item.prop_id || item.id}_${b.book_key || b.key}`,
            event_id: item.event_id || `${item.away_team}_${item.home_team}`,
            sport,
            away_team: item.away_team || 'AWAY',
            home_team: item.home_team || 'HOME',
            player_id: item.player_id || item.player_name?.toLowerCase().replace(/\s+/g, '_'),
            player_name: item.player_name || 'Player',
            team_abbr: item.team_abbr || item.team || '',
            market: item.market_label || item.market || 'Prop',
            side: (item.side || 'over').toLowerCase(),
            fair_prob: item.fair_prob || 0.54,
            ev_pct: Number((b.ev_pct ?? item.ev_pct ?? 2.5).toFixed(1)),
            steam_score: item.steam_score ?? 60,
            trends: {
              l5: item.trends?.l5 ?? 0.6,
              l10: item.trends?.l10 ?? 0.6,
              l20: item.trends?.l20 ?? 0.6
            },
            context: {
              lineup_confirmed: item.context?.lineup_confirmed ?? true,
              weather_flag: item.context?.weather_flag ?? 'clear'
            },
            book: {
              book_key: (b.book_key || b.key || 'draftkings').toLowerCase(),
              decimal_odds: b.decimal_odds || americanToDecimal(b.american_odds || b.price),
              line: b.line ?? item.line ?? 0.5,
              tier: b.tier || item.tier || 'main'
            }
          });
        }
      }
    } catch (err) {
      console.warn(`Warning fetching ${sport}:`, err.message);
    }
  }

  const outDir = path.join(process.cwd(), 'data');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'props.json'),
    JSON.stringify(normalizedProps, null, 2),
    'utf8'
  );

  console.log(`Saved ${normalizedProps.length} props to data/props.json`);
}

run();
