<<<<<<< Updated upstream
// services.js (updated)
// Realtime Database tetap dipakai untuk live / low-latency.
// Firestore dipakai untuk history (queriable, paginated).
import { ref, onValue, off } from "firebase/database";
import { db, firestore } from "./lib/firebase"; // db = RTDB instance, firestore = Firestore instance
import {
  collection,
  addDoc,
  query as fsQuery,
  orderBy,
  limit as fsLimit,
  where,
  getDocs,
} from "firebase/firestore";

/* exported series arrays (same API as before) */
export let temperatureData = [];
export let coData = [];
export let ammoniaData = [];
export let humidityData = [];
export let fanData = [];

const rtdb = db; // keep naming similar to previous code
const HISTORY_COLLECTION = "sensor_history"; // Firestore collection for history
const MAX_POINTS = 24;
let sensorRef = null;

/**
 * connectToFirebase(onUpdate, { path = "/sensor", maxPoints = MAX_POINTS, hoursBack = null })
 *
 * - hoursBack: bila diberikan, load history dari Firestore dalam rentang jam ke belakang.
 * - maxPoints: batas array live.
 *
 * NOTES:
 * - This will NOT download all historical data. Firestore query uses orderBy+limit.
 * - Client will append live updates to in-memory arrays and call onUpdate.
 * - Client writes history to Firestore but throttled to avoid excessive writes.
 */
export function connectToFirebase(
  onUpdate,
  { path = "/sensor", maxPoints = MAX_POINTS, hoursBack = null } = {}
) {
  sensorRef = ref(rtdb, path);
  console.log("✅ Firebase listener connected to path:", path);

  // 1) Load history from Firestore (safe, paginated)
  (async () => {
    try {
      const col = collection(firestore, HISTORY_COLLECTION);

      // Build query: order by time descending, limit to maxPoints
      // If hoursBack provided, add where filter (time is stored as number ms)
      const constraints = [];
      if (typeof hoursBack === "number" && hoursBack > 0) {
        const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
        constraints.push(where("time", ">=", cutoff));
      }
      constraints.push(orderBy("time", "desc"));
      constraints.push(fsLimit(maxPoints));

      const q = fsQuery(col, ...constraints);
      const snap = await getDocs(q);

      if (!snap.empty) {
        // snap.docs is in descending order; we'll map and reverse to ascending (chronological)
        const docs = snap.docs.map(d => d.data());
        docs.reverse(); // ascending chronological

        // build series arrays in the same shape as before
        const temp = [];
        const co = [];
        const nh3 = [];
        const humidity = [];
        const fan = [];

        docs.forEach(d => {
          // Expect fields: suhu, co, amonia, kelembapan, kipas_status, time (ms)
          const tMs = typeof d.time === "number" ? d.time : (d.time?.toMillis ? d.time.toMillis() : null);
          if (!tMs) return;
          const iso = new Date(tMs).toISOString();
          const day = new Date(tMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

          if (d.suhu !== undefined && d.suhu !== null) temp.push({ time: iso, value: d.suhu, day });
          if (d.co !== undefined && d.co !== null) co.push({ time: iso, value: d.co, day });
          if (d.amonia !== undefined && d.amonia !== null) nh3.push({ time: iso, value: d.amonia, day });
          if (d.kelembapan !== undefined && d.kelembapan !== null) humidity.push({ time: iso, value: d.kelembapan, day });
          if (d.kipas_status !== undefined && d.kipas_status !== null) fan.push({ time: iso, value: d.kipas_status, day });
        });

        // assign trimmed arrays (ensure length <= maxPoints)
        const trim = (arr) => (arr.length > maxPoints ? arr.slice(-maxPoints) : arr);
        temperatureData = trim(temp);
        coData = trim(co);
        ammoniaData = trim(nh3);
        humidityData = trim(humidity);
        fanData = trim(fan);

        // initial UI update
        onUpdate?.({
          temperatureData,
          coData,
          ammoniaData,
          humidityData,
          fanData,
        });
      }
    } catch (err) {
      console.warn("⚠️ Gagal load history from Firestore on connect:", err);
    }
  })();

  // 2) Attach realtime listener to RTDB for live updates (unchanged behavior)
  // We'll also append live points to arrays and push a throttled historical write to Firestore.
  const HISTORY_WRITE_MIN_INTERVAL = 60 * 1000; // 1 minute min interval between history writes from client
  let lastHistoryWrite = 0;

  onValue(sensorRef, async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // copy arrays to avoid mutation side-effects
    temperatureData = Array.isArray(temperatureData) ? [...temperatureData] : [];
    coData = Array.isArray(coData) ? [...coData] : [];
    ammoniaData = Array.isArray(ammoniaData) ? [...ammoniaData] : [];
    humidityData = Array.isArray(humidityData) ? [...humidityData] : [];
    fanData = Array.isArray(fanData) ? [...fanData] : [];

    const suhu = typeof data.suhu !== "undefined" ? (parseFloat(data.suhu) || 0) : 0;
    const co = typeof data.co !== "undefined" ? (parseFloat(data.co) || 0) : 0;
    const kelembapan = typeof data.kelembapan !== "undefined" ? (parseFloat(data.kelembapan) || 0) : 0;
    const amonia = typeof data.amonia !== "undefined" ? (parseFloat(data.amonia) || 0) : 0;
    const kipas_status = typeof data.kipas_status !== "undefined" ? (data.kipas_status === null ? null : parseInt(data.kipas_status, 10)) : null;
    const waktuStr = data.waktu || null;

    let time = Date.now();
    if (waktuStr) {
      const parsed = new Date(String(waktuStr).replace(" ", "T"));
      if (!isNaN(parsed.getTime())) time = parsed.getTime();
    }

    const iso = new Date(time).toISOString();
    const day = new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    temperatureData.push({ time: iso, value: suhu, day });
    coData.push({ time: iso, value: co, day });
    ammoniaData.push({ time: iso, value: amonia, day });
    humidityData.push({ time: iso, value: kelembapan, day });
    fanData.push({ time: iso, value: kipas_status, day });

    // keep only last maxPoints
    if (temperatureData.length > maxPoints) temperatureData.shift();
    if (coData.length > maxPoints) coData.shift();
    if (ammoniaData.length > maxPoints) ammoniaData.shift();
    if (humidityData.length > maxPoints) humidityData.shift();
    if (fanData.length > maxPoints) fanData.shift();

    // write to Firestore (throttled to avoid rapid writes from client)
    try {
      if (Date.now() - lastHistoryWrite >= HISTORY_WRITE_MIN_INTERVAL) {
        lastHistoryWrite = Date.now();
        // fire-and-forget: we don't block UI by awaiting here
        saveHistoricalData({
          suhu,
          co,
          amonia,
          kelembapan,
          kipas_status,
          time,
        }).catch((e) => {
          console.warn("Failed to write history to Firestore:", e);
        });
      }
    } catch (e) {
      console.warn("history write throttle error:", e);
    }

    // IMPORTANT: do NOT run cleanupOldHistoricalData() here. Cleanup should be done server-side (Cloud Function/Cron).
    // Send update to frontend
    onUpdate?.({
      temperatureData,
      coData,
      ammoniaData,
      humidityData,
      fanData,
    });
  });
=======
// app/services.js
// Dummy datasets + business logic + simple simulator to emulate streaming data (ESP32)
import { insertSensorData } from "../lib/database.js"; // ← Tambahkan koneksi DB

const MAX_POINTS = 24;

// --- Initial dummy datasets ---
function makeInitialLabels(count = 7) {
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const labels = [];
  for (let i = 0; i < count; i++) labels.push(days[i % days.length]);
  return labels;
>>>>>>> Stashed changes
}

/**
 * Save history to Firestore (append-only).
 * Note: client writes are throttled in connectToFirebase (so this function is safe to call infrequently).
 */
async function saveHistoricalData({ suhu, co, amonia, kelembapan, kipas_status, time }) {
  try {
    const col = collection(firestore, HISTORY_COLLECTION);
    // store time as numeric ms so queries/orderBy on "time" work reliably
    await addDoc(col, {
      suhu,
      co,
      amonia,
      kelembapan,
      kipas_status,
      time, // number (ms)
    });
  } catch (error) {
    console.error("⚠️ Gagal menyimpan data historis ke Firestore:", error);
  }
}

<<<<<<< Updated upstream
/* NOTE:
   cleanupOldHistoricalData() removed from client. Client must NOT scan & remove historical documents.
   Use Cloud Function or backend job to prune old documents in Firestore if retention needed.
*/

export function disconnectFirebase() {
  if (sensorRef) {
    off(sensorRef);
    sensorRef = null;
    console.log("❌ Firebase listener disconnected");
  }
}

=======
export let temperatureData = labels.map((d, i) => ({
  day: d + (i >= 7 ? ` ${i - 6}` : ""),
  value: 24 + Math.round(Math.sin(i / 2) * 3) + (i % 3),
}));

export let co2Data = labels.map((d, i) => ({
  day: d + (i >= 7 ? ` ${i - 6}` : ""),
  value: 280 + Math.round(Math.cos(i / 3) * 40) + (i % 5) * 3,
}));

export let ammoniaData = labels.map((d, i) => ({
  day: d + (i >= 7 ? ` ${i - 6}` : ""),
  value: 180 + Math.round(Math.sin(i / 1.7) * 25) + (i % 4) * 5,
}));

// --- Helpers / Business logic ---
>>>>>>> Stashed changes
export function last(arr) {
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1].value : null;
}

export function levelFor(type, value) {
  if (value === null || value === undefined) return "good";
  if (type === "temp") {
    if (value >= 35) return "bad";
    if (value >= 31) return "warn";
    return "good";
  }
  if (type === "nh3") {
    if (value >= 600) return "bad";
    if (value >= 301) return "warn";
    return "good";
  }
  if (type === "co" || type === "co2") {
    if (value >= 1500) return "bad";
    if (value >= 1001) return "warn";
    return "good";
  }
  if (type === "humidity") {
    if (value < 40) return "warn";
    if (value > 80) return "warn";
    return "good";
  }
  return "good";
}

export function overallLevelFromLevels(tempLevel, coLevel, nh3Level) {
  const arr = [tempLevel, coLevel, nh3Level];
  if (arr.includes("bad")) return "bad";
  if (arr.includes("warn")) return "warn";
  return "good";
}

export function statusTextFromOverall(overallLevel) {
  return overallLevel === "good"
    ? "Kualitas Udara Anda baik"
    : overallLevel === "warn"
    ? "Kualitas Udara Anda kurang baik"
    : "Kualitas Udara Anda tidak baik";
}

export function getCircleGradient(overallLevel) {
  if (overallLevel === "good") {
    return { from: "#34D399", to: "#047857", text: "#047857", border: "#34D399" };
  }
  if (overallLevel === "warn") {
    return { from: "#B59B00", to: "#7C6B00", text: "#7C6B00", border: "#B59B00" };
  }
  return { from: "#F87171", to: "#B91C1C", text: "#B91C1C", border: "#F87171" };
}

export function colorForLevel(lvl) {
  if (lvl === "good") return "#047857";
  if (lvl === "warn") return "#92400E";
  return "#B91C1C";
}

<<<<<<< Updated upstream
/**
 * Optional helper if you want to fetch history manually from Firestore
 * fetchHistory({ hoursBack, limit })
 */
export async function fetchHistory({ hoursBack = null, limit = 500 } = {}) {
  try {
    const col = collection(firestore, HISTORY_COLLECTION);
    const constraints = [];
    if (hoursBack) {
      const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
      constraints.push(where("time", ">=", cutoff));
=======
// --- Simple simulator to mimic incoming data from ESP32 ---
let _simInterval = null;
let _simOptions = {};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function startSimulation(onUpdate, opts = {}) {
  const intervalMs = opts.intervalMs || 2000;
  const maxPoints = opts.maxPoints || MAX_POINTS;
  const jitter = opts.jitter || {
    temp: { min: 1, max: 1.2 },
    co2: { min: -20, max: 20 },
    nh3: { min: -8, max: 8 },
  };

  stopSimulation();
  _simOptions = { intervalMs, maxPoints, jitter };

  _simInterval = setInterval(async () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const label = `${hh}:${mm}`;

    const prevTemp = last(temperatureData) ?? 26;
    const deltaT = Math.random() * (jitter.temp.max - jitter.temp.min) + jitter.temp.min;
    let nextTemp = Math.round((prevTemp + deltaT) * 10) / 10;
    nextTemp = clamp(nextTemp, -10, 60);

    const prevCo2 = last(co2Data) ?? 300;
    const deltaCo2 = Math.round(Math.random() * (jitter.co2.max - jitter.co2.min) + jitter.co2.min);
    let nextCo2 = clamp(prevCo2 + deltaCo2, 0, 10000);

    const prevNh3 = last(ammoniaData) ?? 200;
    const deltaNh3 = Math.round(Math.random() * (jitter.nh3.max - jitter.nh3.min) + jitter.nh3.min);
    let nextNh3 = clamp(prevNh3 + deltaNh3, 0, 10000);

    temperatureData = [...temperatureData, { day: label, value: Number(nextTemp.toFixed(1)) }];
    co2Data = [...co2Data, { day: label, value: Math.round(nextCo2) }];
    ammoniaData = [...ammoniaData, { day: label, value: Math.round(nextNh3) }];

    if (temperatureData.length > maxPoints) temperatureData = temperatureData.slice(-maxPoints);
    if (co2Data.length > maxPoints) co2Data = co2Data.slice(-maxPoints);
    if (ammoniaData.length > maxPoints) ammoniaData = ammoniaData.slice(-maxPoints);

    const tempLevel = levelFor("temp", nextTemp);
    const co2Level = levelFor("co2", nextCo2);
    const nh3Level = levelFor("nh3", nextNh3);
    const overall = overallLevelFromLevels(tempLevel, co2Level, nh3Level);

    // 🔹 Simpan ke database
    await insertSensorData({
      temperature: nextTemp,
      co2: nextCo2,
      nh3: nextNh3,
      overall,
    });

    if (typeof onUpdate === "function") {
      onUpdate({
        temperatureData: [...temperatureData],
        co2Data: [...co2Data],
        ammoniaData: [...ammoniaData],
        overall,
      });
>>>>>>> Stashed changes
    }
    constraints.push(orderBy("time", "desc"));
    constraints.push(fsLimit(limit));
    const q = fsQuery(col, ...constraints);
    const snap = await getDocs(q);
    if (snap.empty) return [];
    const arr = snap.docs.map(d => d.data()).sort((a,b) => a.time - b.time);
    return arr;
  } catch (e) {
    console.warn("fetchHistory error (Firestore)", e);
    return [];
  }
}
