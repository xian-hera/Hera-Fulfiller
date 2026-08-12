// debug-clock-in.js
//
// Dumps the raw Connecteam time-activities response for one location's
// management time clock, so we can see exactly what's coming back (field
// names, whether there even are any activities today, clockIn/clockOut
// values) instead of guessing why "Check Clock In" shows everyone as gray.
//
// Usage:
//   node debug-clock-in.js 10        (location code, e.g. 01, 05, 10, 11 — default '10')
//
// Reads the same env vars as connecteam.js (falls back to the same hardcoded
// defaults already in that file).

const axios = require('axios');

const CONNECTEAM_BASE_URL = 'https://api.connecteam.com';
const API_KEY = process.env.CONNECTEAM_API_KEY || '81e988c4-e5b0-4cf0-ab66-52223ceff2ca';

// Same map as connecteam.js — keep in sync if you've added more locations.
const TIME_CLOCK_IDS = {
  '01': 6905828, '02': 6905850, '03': 6905862, '04': 6905877,
  '05': 6905888, '06': 6905890, '07': 6905892, '08': 6905896,
  '09': 6905904, '10': 6905921, '11': 6905956,
};

const loc = process.argv[2] || '10';
const clockId = TIME_CLOCK_IDS[loc];

function ymd(date) {
  return date.toISOString().split('T')[0];
}

async function fetchActivities(startDate, endDate, label) {
  console.log(`\n=== ${label}: startDate=${startDate} endDate=${endDate} ===`);
  try {
    const res = await axios.get(
      `${CONNECTEAM_BASE_URL}/time-clock/v1/time-clocks/${clockId}/time-activities`,
      {
        headers: { 'X-API-KEY': API_KEY, 'accept': 'application/json' },
        params: { startDate, endDate },
      }
    );
    const activities = res.data?.data?.activities || [];
    console.log(`HTTP ${res.status} — ${activities.length} activities returned`);
    if (activities.length === 0) {
      console.log('Full raw response (in case the activities array is nested differently):');
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      activities.forEach((a, i) => {
        console.log(`  [${i}] ${JSON.stringify(a)}`);
      });
    }
  } catch (err) {
    console.error(`  Request failed:`, err.response?.status, err.response?.data || err.message);
  }
}

async function main() {
  if (!clockId) {
    console.error(`No TIME_CLOCK_IDS entry for location "${loc}"`);
    process.exit(1);
  }
  console.log(`Location: ${loc}  →  clockId: ${clockId}`);

  const now = new Date();
  console.log(`Server clock right now: ${now.toISOString()} (UTC)`);

  const utcToday = ymd(now);

  // Eastern-local "today", computed without relying on the server's TZ setting.
  const easternStr = now.toLocaleString('en-US', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [m, d, y] = easternStr.split('/');
  const easternToday = `${y}-${m}-${d}`;

  await fetchActivities(utcToday, utcToday, 'Using UTC "today"');
  if (easternToday !== utcToday) {
    await fetchActivities(easternToday, easternToday, 'Using Eastern-local "today"');
  } else {
    console.log('\n(UTC today and Eastern today are the same date right now, only one check needed)');
  }

  // Also check yesterday and a wide 7-day window, in case activities are
  // logged under a date we're not expecting at all.
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await fetchActivities(ymd(weekAgo), utcToday, 'Last 7 days (UTC range)');
}

main().catch(err => {
  console.error('Fatal error:', err.response?.data || err.message);
  process.exit(1);
});