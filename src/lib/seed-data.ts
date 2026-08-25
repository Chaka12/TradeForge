// ============================================================================
// Seed Data — populates the database with sample symbols, bars, and a default account
// ============================================================================

import { db } from '@/lib/db';
import { generateOHLCV, SEED_SYMBOLS } from '@/lib/engine/data-generator';
import type { Timeframe } from '@/types/trading';

const BATCH_SIZE = 500;

/**
 * Seed the database with sample data.
 * - Creates symbols from SEED_SYMBOLS if they don't already exist
 * - Generates 500 daily bars and 1000 hourly bars for each symbol
 * - Creates a default account with $100,000 balance
 */
export async function seedDatabase(): Promise<void> {
  console.log('🌱 Seeding database...');

  // -----------------------------------------------------------------------
  // 1. Create symbols if they don't exist
  // -----------------------------------------------------------------------
  const symbolRecords: Record<string, string> = {};
  let symbolsCreated = 0;

  for (const config of SEED_SYMBOLS) {
    const existing = await db.symbol.findUnique({ where: { name: config.symbol } });
    if (existing) {
      symbolRecords[config.symbol] = existing.id;
      console.log(`  ✓ Symbol ${config.symbol} already exists (${existing.id})`);
    } else {
      const record = await db.symbol.create({
        data: {
          name: config.symbol,
          exchange: 'SIM',
          type: config.symbol.includes('/')
            ? ['BTC/USD', 'ETH/USD'].includes(config.symbol)
              ? 'crypto'
              : 'forex'
            : config.symbol === 'GOLD'
              ? 'commodity'
              : config.symbol === 'NASDAQ'
                ? 'index'
                : 'stock',
        },
      });
      symbolRecords[config.symbol] = record.id;
      symbolsCreated++;
      console.log(`  + Created symbol ${config.symbol} (${record.id})`);
    }
  }

  console.log(`  Symbols: ${symbolsCreated} created, ${SEED_SYMBOLS.length - symbolsCreated} existing`);

  // -----------------------------------------------------------------------
  // 2. Generate and store bars for each symbol/timeframe combination
  // -----------------------------------------------------------------------
  const now = new Date();
  const timeframes: { tf: Timeframe; count: number }[] = [
    { tf: '1D', count: 500 },
    { tf: '1H', count: 1000 },
  ];

  let totalBarsCreated = 0;

  for (const config of SEED_SYMBOLS) {
    const symbolId = symbolRecords[config.symbol];

    for (const { tf, count } of timeframes) {
      // Check if bars already exist for this symbol/timeframe
      const existingCount = await db.bar.count({
        where: { symbolId, timeframe: tf },
      });

      if (existingCount > 0) {
        console.log(`  ✓ ${config.symbol} ${tf}: ${existingCount} bars already exist, skipping`);
        continue;
      }

      const tfSeconds: Record<string, number> = {
        '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
        '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800, '1M': 2592000,
      };
      const seconds = tfSeconds[tf] ?? 86400;
      const startDate = new Date(now.getTime() - count * seconds * 1000);
      startDate.setSeconds(0, 0);

      const bars = generateOHLCV(config.symbol, startDate, count, tf);

      // Insert in batches for efficiency
      for (let i = 0; i < bars.length; i += BATCH_SIZE) {
        const batch = bars.slice(i, i + BATCH_SIZE);
        await db.bar.createMany({
          data: batch.map((bar) => ({
            symbolId,
            timestamp: bar.time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: BigInt(Math.round(bar.volume)),
            timeframe: tf,
          })),
        });
      }

      totalBarsCreated += bars.length;
      console.log(`  + ${config.symbol} ${tf}: generated ${bars.length} bars`);
    }
  }

  console.log(`  Total bars created: ${totalBarsCreated}`);

  // -----------------------------------------------------------------------
  // 3. Create default account
  // -----------------------------------------------------------------------
  const existingAccount = await db.account.findFirst({ where: { name: 'Default' } });
  if (existingAccount) {
    console.log(`  ✓ Default account already exists (${existingAccount.id}, balance: $${existingAccount.balance.toLocaleString()})`);
  } else {
    const account = await db.account.create({
      data: {
        name: 'Default',
        balance: 100000,
        currency: 'USD',
      },
    });
    console.log(`  + Created default account (${account.id}, balance: $100,000.00)`);
  }

  console.log('✅ Seeding complete.\n');
}

// Run seed if executed directly (bun run src/lib/seed-data.ts)
const isDirectRun = process.argv[1]?.endsWith('seed-data.ts') || process.argv[1]?.endsWith('seed-data.js');
if (isDirectRun) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
