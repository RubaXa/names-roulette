#!/usr/bin/env node
// Загрузка женских имён новорождённых с data.mos.ru (2026→2000)
// Чекпоинты: data/checkpoints/<year>.json — при повторе пропускает уже скачанные годы
// Сброс:     node fetch_names.mjs --reset

import fs from "fs";
import path from "path";

const COOKIES = [
  "_ym_uid=1736598115465830617",
  "uwyii=933e174d-82e7-64c8-e38c-10ecc9a96cba",
  "uxs_uid=e31f4e80-633d-11f0-a8cf-4360b1be8ee6",
  "cookie-agreement=true",
  "yabm=8d4hofl4mdpv1a8ebu5ek6n41u",
  "_ym_d=1781956770",
  "_ym_isad=2",
  "Ltpatoken2=rsuRAZtFsYgaVtVf0fNoF+3L1fLicditioZBuL+/WI9E6mWqb9lZ1a4b4yDTSvK2KQibikxmOHYeA7Emu1dSH8/D2CZ51eMrUrpsnd566S88KNqB57OhO1Kk1KsdW+S8V7OdFc3fBGCOjvY0AUUlVhvDH7Kmg8BFKbu7qdMQSRm+z9WSJLSm/9zRtcCT22hVL23Kbs7kg87ewJbEEoR3PSCgu6QsbC24szDoHJT7xc/gIL01qwBD3YTEgsFVZUFLeKDm2uWICwMieWG4WYXs5mPdb8hYvLgoSJfU4yhxnNClQI0M70GpYd5tM+QuudRs+fa+E1G4Hs5HgSJPL9EOVg==",
  "ghur=PdFUn34-Hm1gpE27pv7zHG9tNVqTVAbhpvncvdSpntw|",
  "sbp_sid=000000000000000000000000000000000000",
  "at=1",
  "session-cookie=18bad3b98e1c76e411e68a2e6940ac725468bfccd4dd13274983a13f927ed20e5941ac87111f908a9d9c355ca5b492b2",
].join("; ");

const HEADERS = {
  accept: "application/json",
  "content-type": "application/json",
  cookie: COOKIES,
  origin: "https://data.mos.ru",
  referer: "https://data.mos.ru/opendata/7704111479-svedeniya-o-naibolee-populyarnyh-jenskih-imenah-sredi-novorojdennyh",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
};

const URL = "https://data.mos.ru/api/v2/odata/catalog/get";
const DATASET_ID = 6269;
const EPOCH = "2026-04-14 15:00:04";
const LIMIT = 1000;
const YEARS = Array.from({ length: 27 }, (_, i) => 2026 - i); // 2026→2000

const OUT_DIR = "data";
const CKPT_DIR = path.join(OUT_DIR, "checkpoints");

// ── цвета ──────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  grey:   "\x1b[90m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  bold:   "\x1b[1m",
  blue:   "\x1b[34m",
};

const ts  = () => new Date().toTimeString().slice(0, 8);
const log = (msg, color = C.reset) => console.log(`${C.grey}${ts()}${C.reset}  ${color}${msg}${C.reset}`);

// ── утилиты ────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseBatch(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["response", "Items", "items", "value", "data", "result"]) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

// ── чекпоинты ──────────────────────────────────
const ckptPath = (year) => path.join(CKPT_DIR, `${year}.json`);

function saveCheckpoint(year, records) {
  fs.mkdirSync(CKPT_DIR, { recursive: true });
  fs.writeFileSync(ckptPath(year), JSON.stringify(records), "utf-8");
}

function loadCheckpoint(year) {
  return JSON.parse(fs.readFileSync(ckptPath(year), "utf-8"));
}

// ── запрос одной страницы (с ретраями) ─────────
async function fetchPage(year, offset, attempt = 1) {
  const MAX_RETRIES = 3;
  const body = JSON.stringify({
    id: DATASET_ID,
    epoch: EPOCH,
    timestamp: 1,
    criteria: `Year = ${year}`,
    paging: true,
    limit: LIMIT,
    offset,
    fetchGeodata: false,
  });

  try {
    const t0 = Date.now();
    const resp = await fetch(URL, { method: "POST", headers: HEADERS, body });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

    const data = await resp.json();
    const batch = parseBatch(data);
    log(`    offset=${offset}  →  ${batch.length} записей  (${elapsed}s)`, C.grey);
    return batch;

  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const wait = 2000 * attempt;
      log(`    Ошибка (попытка ${attempt}/${MAX_RETRIES}): ${err.message}. Повтор через ${wait / 1000}s...`, C.yellow);
      await sleep(wait);
      return fetchPage(year, offset, attempt + 1);
    }
    throw err;
  }
}

// ── загрузка всего года ─────────────────────────
async function fetchYear(year) {
  const records = [];
  let offset = 0;
  let page = 1;

  while (true) {
    log(`  Страница ${page} (offset=${offset})`, C.grey);
    const batch = await fetchPage(year, offset);

    if (!batch.length) break;
    records.push(...batch);
    if (batch.length < LIMIT) break;

    offset += LIMIT;
    page++;
    await sleep(300);
  }

  return records;
}

// ── агрегация по именам ─────────────────────────
// Входные записи: { Name, NumberOfPersons, Year, ... }
// Выход: { "Анна": { total: 4821, byYear: { "2026": 145, ... } }, ... }
// Сортировка: по убыванию total
function aggregate(allRecords) {
  const map = {};

  for (const r of allRecords) {
    const name  = r.Name;
    const year  = String(r.Year);
    const count = Number(r.NumberOfPersons) || 0;

    if (!map[name]) map[name] = { total: 0, byYear: {} };
    map[name].total += count;
    map[name].byYear[year] = (map[name].byYear[year] || 0) + count;
  }

  // Сортируем по total DESC
  return Object.fromEntries(
    Object.entries(map).sort(([, a], [, b]) => b.total - a.total)
  );
}

// ── main ────────────────────────────────────────
async function main() {
  const reset = process.argv.includes("--reset");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (reset && fs.existsSync(CKPT_DIR)) {
    fs.rmSync(CKPT_DIR, { recursive: true });
    log("Чекпоинты сброшены", C.yellow);
  }

  log(`${"═".repeat(55)}`, C.cyan);
  log(`  data.mos.ru — женские имена  2026→2000`, C.cyan + C.bold);
  log(`${"═".repeat(55)}`, C.cyan);

  const t0 = Date.now();
  const done = [], failed = [];

  for (let i = 0; i < YEARS.length; i++) {
    const year     = YEARS[i];
    const progress = `[${i + 1}/${YEARS.length}]`;

    if (fs.existsSync(ckptPath(year))) {
      const n = loadCheckpoint(year).length;
      log(`${progress} ${year}  уже скачан (${n} зап.)  →  пропуск`, C.blue);
      done.push(year);
      continue;
    }

    log(`${progress} ${year}  загружаю...`, C.cyan);
    const tYear = Date.now();

    try {
      const records = await fetchYear(year);
      const elapsed = ((Date.now() - tYear) / 1000).toFixed(1);

      if (records.length === 0) {
        log(`${progress} ${year}  ⚠ 0 записей — год пропущен в датасете  (${elapsed}s)`, C.yellow);
        failed.push(year);
      } else {
        saveCheckpoint(year, records);
        done.push(year);
        log(`${progress} ${year}  ✓ ${records.length} записей  (${elapsed}s)`, C.green);
      }
    } catch (err) {
      const elapsed = ((Date.now() - tYear) / 1000).toFixed(1);
      log(`${progress} ${year}  ✗ ${err.message}  (${elapsed}s)`, C.red);
      failed.push(year);
    }

    await sleep(500);
  }

  // ── агрегация и сохранение ──────────────────
  log("", C.reset);
  log("Агрегирую и сохраняю...", C.cyan);

  const allRecords = done
    .sort((a, b) => b - a)
    .flatMap((year) => loadCheckpoint(year));

  const aggregated = aggregate(allRecords);
  const nameCount  = Object.keys(aggregated).length;

  // JSON — агрегированный
  const jsonPath = path.join(OUT_DIR, "female_names.json");
  fs.writeFileSync(jsonPath, JSON.stringify(aggregated, null, 2), "utf-8");
  log(`JSON  →  ${jsonPath}  (${nameCount} уникальных имён)`, C.green);

  // CSV — плоский: Name, total, year_2026, year_2025, ...
  const allYears = [...new Set(allRecords.map((r) => String(r.Year)))].sort((a, b) => b - a);
  const csvPath  = path.join(OUT_DIR, "female_names.csv");
  const header   = ["name", "total", ...allYears.map((y) => `year_${y}`)].join(",");
  const rows = Object.entries(aggregated).map(([name, { total, byYear }]) =>
    [
      JSON.stringify(name),
      total,
      ...allYears.map((y) => byYear[y] ?? 0),
    ].join(",")
  );
  fs.writeFileSync(csvPath, [header, ...rows].join("\n"), "utf-8");
  log(`CSV   →  ${csvPath}`, C.green);

  // ── итоги ───────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`${"─".repeat(55)}`, C.cyan);
  log(`  Годов OK: ${done.length}  |  Пропущено/ошибок: ${failed.length}  |  Имён: ${nameCount}  |  Время: ${elapsed}s`, C.green + C.bold);
  if (failed.length) log(`  Без данных: ${failed.join(", ")}`, C.yellow);
  log(`${"─".repeat(55)}`, C.cyan);
}

main().catch((err) => {
  console.error("Критическая ошибка:", err);
  process.exit(1);
});
