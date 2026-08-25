// Verify cross-timeframe data ranges and shape coordinate math

const TIMEFRAMES = {
  '1m':  { seconds: 60 },
  '5m':  { seconds: 300 },
  '15m': { seconds: 900 },
  '30m': { seconds: 1800 },
  '1H':  { seconds: 3600 },
  '3H':  { seconds: 10800 },
  '4H':  { seconds: 14400 },
  '8H':  { seconds: 28800 },
  '12H': { seconds: 43200 },
  '1D':  { seconds: 86400 },
  '1W':  { seconds: 604800 },
  '1M':  { seconds: 2592000 },
};

const UNIVERSAL_DAYS = 500;
const MAX_BARS = 5000;
const universalRangeSeconds = UNIVERSAL_DAYS * 86400;

console.log('=== Cross-Timeframe Data Range Verification ===');
console.log(`Universal range: ${UNIVERSAL_DAYS} days (${universalRangeSeconds} seconds)`);
console.log(`Max bars per TF: ${MAX_BARS}\n`);

const results = [];
for (const [tf, info] of Object.entries(TIMEFRAMES)) {
  const barCount = Math.min(MAX_BARS, Math.max(100, Math.floor(universalRangeSeconds / info.seconds)));
  const actualDays = (barCount * info.seconds) / 86400;
  results.push({ tf, seconds: info.seconds, barCount, actualDays });
}

console.log('TF     | Seconds | Bar Count | Days Covered | Full 500d?');
console.log('-------+---------+-----------+--------------+----------');
for (const r of results) {
  const full = r.actualDays >= UNIVERSAL_DAYS - 1 ? 'YES' : 'NO (capped)';
  console.log(`${r.tf.padEnd(6)} | ${String(r.seconds).padStart(7)} | ${String(r.barCount).padStart(9)} | ${r.actualDays.toFixed(1).padStart(12)} | ${full}`);
}

// Simulate a trendline placed on 1D
const now = Date.now() / 1000;
const universalStart = now - UNIVERSAL_DAYS * 86400;

const pointA_time = universalStart + 200 * 86400; // 200 days in
const pointB_time = universalStart + 300 * 86400; // 300 days in

console.log('\n=== Shape Coordinate Math ===');
console.log(`Trendline A at day 200, B at day 300 of 500-day range`);
console.log(`Expected relative positions: A=0.400, B=0.600\n`);

for (const r of results) {
  const tfEnd = universalStart + r.barCount * r.seconds;
  const aInRange = pointA_time >= universalStart && pointA_time <= tfEnd;
  const bInRange = pointB_time >= universalStart && pointB_time <= tfEnd;
  const aRel = aInRange ? (pointA_time - universalStart) / (tfEnd - universalStart) : null;
  const bRel = bInRange ? (pointB_time - universalStart) / (tfEnd - universalStart) : null;
  
  const slopeOk = aRel !== null && bRel !== null ? Math.abs((bRel - aRel) - 0.2) < 0.01 : false;
  console.log(`  ${r.tf.padEnd(4)}: A=${aRel?.toFixed(3) ?? 'OUT'}, B=${bRel?.toFixed(3) ?? 'OUT'}, slope_delta=${((bRel??0)-(aRel??0)).toFixed(3)} ${slopeOk ? 'OK' : 'WARN'}`);
}

// Compare old behavior
console.log('\n=== OLD Behavior (different start per TF) ===');
for (const [tf, info] of Object.entries(TIMEFRAMES)) {
  const barCount = tf === '1D' ? 500 : 1000;
  const oldStart = now - barCount * info.seconds;
  const aInRange = pointA_time >= oldStart && pointA_time <= now;
  const bInRange = pointB_time >= oldStart && pointB_time <= now;
  console.log(`  ${tf.padEnd(4)}: start_offset=${((universalStart - oldStart) / 86400).toFixed(0)}d, A=${aInRange ? 'in' : 'OUT'}, B=${bInRange ? 'in' : 'OUT'} ${!aInRange || !bInRange ? 'BROKEN' : 'ok'}`);
}