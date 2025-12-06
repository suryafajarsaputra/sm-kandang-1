// services.js
import { ref, onValue, off, set, get, remove } from "firebase/database";
import { db } from "./lib/firebase";

// exported arrays (frontend akan meng-import ini)
export let temperatureData = [];
export let coData = [];
export let ammoniaData = [];
export let humidityData = [];
export let fanData = [];

const MAX_POINTS = 24;
let sensorRef = null;

const HISTORY_PATH = "/sensor/history"; // lokasi untuk menyimpan riwayat
const RETENTION_DAYS = 3; // simpan data 3 hari ke belakang

/**
 * Menghubungkan ke Firebase Realtime Database
 * dan membaca data dari node "/sensor"
 *
 * Contoh payload:
 * {
 *   amonia: 12,
 *   co: 18,
 *   kelembapan: 60.2,
 *   kipas_status: 1,
 *   suhu: 28.4,
 *   waktu: "2025-10-21 14:14:56"
 * }
 *
 * onUpdate akan dipanggil dengan objek:
 * { temperatureData, coData, ammoniaData, humidityData, fanData }
 */
export function connectToFirebase(
  onUpdate,
  { path = "/sensor", maxPoints = MAX_POINTS } = {}
) {
  sensorRef = ref(db, path);
  console.log("✅ Firebase listener connected to path:", path);

  onValue(sensorRef, async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // salin array agar aman terhadap hot-reload
    temperatureData = Array.isArray(temperatureData) ? [...temperatureData] : [];
    coData = Array.isArray(coData) ? [...coData] : [];
    ammoniaData = Array.isArray(ammoniaData) ? [...ammoniaData] : [];
    humidityData = Array.isArray(humidityData) ? [...humidityData] : [];
    fanData = Array.isArray(fanData) ? [...fanData] : [];

    // ambil nilai dari Firebase (safe parse)
    const suhu = typeof data.suhu !== "undefined" ? parseFloat(data.suhu) || 0 : 0;
    const co = typeof data.co !== "undefined" ? parseFloat(data.co) || 0 : 0;
    const kelembapan =
      typeof data.kelembapan !== "undefined" ? parseFloat(data.kelembapan) || 0 : 0;
    const amonia =
      typeof data.amonia !== "undefined" ? parseFloat(data.amonia) || 0 : 0;
    const kipas_status =
      typeof data.kipas_status !== "undefined"
        ? (data.kipas_status === null ? null : parseInt(data.kipas_status, 10))
        : null;
    const waktuStr = data.waktu || null;

    // konversi waktu string ke timestamp (ms)
    let time = Date.now();
    if (waktuStr) {
      // replace first space with T to make ISO-compatible if needed
      const parsed = new Date(waktuStr.replace(" ", "T"));
      if (!isNaN(parsed.getTime())) {
        time = parsed.getTime();
      }
    }

    // tambahkan data baru: format { time, value } agar frontend mudah pakai
    temperatureData.push({ time, value: suhu });
    coData.push({ time, value: co });
    ammoniaData.push({ time, value: amonia });
    humidityData.push({ time, value: kelembapan });
    // kipas status bisa 0/1/null — tetap simpan sebagai value
    fanData.push({ time, value: kipas_status });

    // batasi panjang array agar tidak membengkak
    if (temperatureData.length > maxPoints) temperatureData.shift();
    if (coData.length > maxPoints) coData.shift();
    if (ammoniaData.length > maxPoints) ammoniaData.shift();
    if (humidityData.length > maxPoints) humidityData.shift();
    if (fanData.length > maxPoints) fanData.shift();

    // simpan ke riwayat Firebase
    await saveHistoricalData({
      suhu,
      co,
      amonia,
      kelembapan,
      kipas_status,
      time,
    });

    // cleanup data historis lama
    await cleanupOldHistoricalData();

    // kirim update ke frontend
    onUpdate?.({
      temperatureData,
      coData,
      ammoniaData,
      humidityData,
      fanData,
    });
  });
}

/**
 * Simpan data historis ke node "/sensor/history"
 */
async function saveHistoricalData({ suhu, co, amonia, kelembapan, kipas_status, time }) {
  try {
    const timestamp = new Date(time).toISOString();
    const historyRef = ref(db, `${HISTORY_PATH}/${timestamp}`);
    await set(historyRef, { suhu, co, amonia, kelembapan, kipas_status, time });
  } catch (error) {
    console.error("⚠️ Gagal menyimpan data historis:", error);
  }
}

/**
 * Hapus data historis yang lebih dari RETENTION_DAYS
 */
async function cleanupOldHistoricalData() {
  try {
    const now = Date.now();
    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const snapshot = await get(ref(db, HISTORY_PATH));
    if (!snapshot.exists()) return;

    const data = snapshot.val();
    for (const [key, value] of Object.entries(data)) {
      // value.time diharapkan timestamp (ms) atau ISO string yang dapat di-parse
      const t = typeof value.time === "number" ? value.time : new Date(value.time).getTime();
      if (!isNaN(t) && t < cutoff) {
        await remove(ref(db, `${HISTORY_PATH}/${key}`));
      }
    }
  } catch (error) {
    console.error("⚠️ Gagal menghapus data historis lama:", error);
  }
}

/**
 * Putuskan koneksi listener Firebase
 */
export function disconnectFirebase() {
  if (sensorRef) {
    off(sensorRef);
    sensorRef = null;
    console.log("❌ Firebase listener disconnected");
  }
}

/**
 * Utility: ambil nilai terakhir dari array data
 */
export function last(arr) {
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1].value : null;
}

/**
 * Tentukan level kualitas berdasarkan nilai
 * Menerima type: 'temp', 'nh3', 'co' (atau 'co2'), 'humidity'
 */
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
    // contoh threshold sederhana: ideal 40% - 80%
    if (value < 40) return "warn";
    if (value > 80) return "warn";
    return "good";
  }

  return "good";
}

/**
 * Gabungkan level menjadi 1 status keseluruhan
 */
export function overallLevelFromLevels(tempLevel, coLevel, nh3Level) {
  const arr = [tempLevel, coLevel, nh3Level];
  if (arr.includes("bad")) return "bad";
  if (arr.includes("warn")) return "warn";
  return "good";
}

/**
 * Ubah level keseluruhan jadi teks status
 */
export function statusTextFromOverall(overallLevel) {
  return overallLevel === "good"
    ? "Kualitas Udara Anda baik"
    : overallLevel === "warn"
    ? "Kualitas Udara Anda kurang baik"
    : "Kualitas Udara Anda tidak baik";
}

/**
 * Tentukan warna gradasi untuk indikator lingkaran
 */
export function getCircleGradient(overallLevel) {
  if (overallLevel === "good") {
    return { from: "#34D399", to: "#047857", text: "#047857", border: "#34D399" };
  }
  if (overallLevel === "warn") {
    return { from: "#B59B00", to: "#7C6B00", text: "#7C6B00", border: "#B59B00" };
  }
  return { from: "#F87171", to: "#B91C1C", text: "#B91C1C", border: "#F87171" };
}

/**
 * Warna tunggal untuk setiap level (dipakai di UI)
 */
export function colorForLevel(lvl) {
  if (lvl === "good") return "#047857";
  if (lvl === "warn") return "#92400E";
  return "#B91C1C";
}
