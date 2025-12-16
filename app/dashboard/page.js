"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  connectToFirebase,
  disconnectFirebase,
  temperatureData as initialTemperatureData,
  coData as initialCoData,
  ammoniaData as initialAmmoniaData,
  humidityData as initialHumidityData,
  fanData as initialFanData,
  last,
  levelFor,
  overallLevelFromLevels,
  statusTextFromOverall,
  getCircleGradient,
  colorForLevel,
} from "../services.js";

/*
  PERUBAHAN:
  - Menambahkan localStorage persistence untuk logs.
  - Bila ada saved logs, di-rehydrate menjadi series saat mount.
  - Menambahkan tombol Logout (menghapus cookie & localStorage, lalu redirect /login).
*/

const LOGS_STORAGE_KEY = "air_quality_logs_v1";

/* helper: build logs from series (tidak diubah) */
function buildLogsFromSeries({ temperatureData = [], coData = [], ammoniaData = [], humidityData = [], fanData = [] }) {
  const map = new Map();

  const push = (arr, keyName) => {
    (Array.isArray(arr) ? arr : []).forEach(item => {
      if (!item || !item.time) return;
      const timeIso = new Date(item.time).toISOString();
      const entry = map.get(timeIso) ?? { time: timeIso, day: item.day ?? new Date(item.time).toLocaleString() };
      entry[keyName] = item.value ?? item.v ?? item.val ?? null;
      map.set(timeIso, entry);
    });
  };

  push(temperatureData, "temp");
  push(coData, "co");
  push(ammoniaData, "nh3");
  push(humidityData, "humidity");
  push(fanData, "fan");

  const arr = Array.from(map.values()).sort((a,b) => new Date(b.time) - new Date(a.time));

  return arr.map(row => {
    const tempLevel = levelFor("temp", row.temp);
    const coLevel = levelFor("co", row.co);
    const nh3Level = levelFor("nh3", row.nh3);
    const humidityLevel = levelFor("humidity", row.humidity);
    const overall = overallLevelFromLevels(tempLevel, coLevel, nh3Level);
    return {
      ...row,
      tempLevel,
      coLevel,
      nh3Level,
      humidityLevel,
      overallLevel: overall,
      statusText: statusTextFromOverall(overall),
    };
  });
}

/* helper: format fan */
function formatFan(fanVal) {
  if (fanVal === 1) return "Aktif";
  if (fanVal === 0) return "Mati";
  if (fanVal === 2) return "2 Aktif";
  if (fanVal === true) return "Aktif";
  return "-";
}

/* helper: CSV */
function toCSV(rows) {
  if (!rows || !rows.length) return "";
  const cols = ["time","day","temp","co","nh3","humidity","fan","statusText"];
  const header = ["Waktu (ISO)","Waktu","Suhu (°C)","CO (ppm)","Amonia (ppm)","Kelembapan (%)","Kipas","Status Ringkas"];
  const csvRows = [header.join(",")];
  for(const r of rows) {
    const line = cols.map(c => {
      const v = r[c] ?? "";
      return `"${String(v).replace(/"/g,'""')}"`;
    }).join(",");
    csvRows.push(line);
  }
  return csvRows.join("\n");
}

/* --- persistence helpers --- */
/* Simpan logs (array) ke localStorage */
function saveLogsToLocalStorage(logs) {
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    // ignore storage errors
    console.warn("Failed to save logs to localStorage", e);
  }
}

/* Load logs dari localStorage (atau null) */
function loadLogsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    console.warn("Failed to parse logs from localStorage", e);
    return null;
  }
}

/* Rehydrate saved logs menjadi series per-sensor untuk charts/table.
   Each series item shape: { time: ISO, value, day } */
function splitLogsToSeries(logs) {
  const temp = [];
  const co = [];
  const nh3 = [];
  const humidity = [];
  const fan = [];
  (Array.isArray(logs) ? logs : []).forEach(entry => {
    // ensure time exists
    if (!entry || !entry.time) return;
    const base = { time: entry.time, day: entry.day ?? new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    if (entry.temp !== undefined && entry.temp !== null) temp.push({ ...base, value: entry.temp });
    if (entry.co !== undefined && entry.co !== null) co.push({ ...base, value: entry.co });
    if (entry.nh3 !== undefined && entry.nh3 !== null) nh3.push({ ...base, value: entry.nh3 });
    if (entry.humidity !== undefined && entry.humidity !== null) humidity.push({ ...base, value: entry.humidity });
    if (entry.fan !== undefined && entry.fan !== null) fan.push({ ...base, value: entry.fan });
  });
  // Keep order descending (same as logs)
  return { temp, co, nh3, humidity, fan };
}

/* --- Component --- */
export default function Home() {
  const router = useRouter();

  // try to load persisted logs first and rehydrate into series
  const persistedLogs = typeof window !== "undefined" ? loadLogsFromLocalStorage() : null;
  const rehydrated = persistedLogs ? splitLogsToSeries(persistedLogs) : {};

  const [temperatureData, setTemperatureData] = useState(rehydrated.temp?.length ? rehydrated.temp : initialTemperatureData);
  const [coData, setCoData] = useState(rehydrated.co?.length ? rehydrated.co : initialCoData);
  const [ammoniaData, setAmmoniaData] = useState(rehydrated.nh3?.length ? rehydrated.nh3 : initialAmmoniaData);
  const [humidityData, setHumidityData] = useState(rehydrated.humidity?.length ? rehydrated.humidity : initialHumidityData);
  const [fanData, setFanData] = useState(rehydrated.fan?.length ? rehydrated.fan : initialFanData);

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    connectToFirebase(
      ({ temperatureData, coData, ammoniaData, humidityData, fanData }) => {
        const fmt = (arr) =>
          Array.isArray(arr)
            ? arr.map((d) => (({
                ...d,
                day: new Date(d.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              })))
            : [];

        // update series live when firebase pushes (this will also update logs -> saved)
        setTemperatureData(fmt(temperatureData));
        setCoData(fmt(coData));
        setAmmoniaData(fmt(ammoniaData));
        setHumidityData(fmt(humidityData));
        setFanData(fmt(fanData));
      },
      { path: "/sensor", hoursBack: 72 }
    );

    return () => disconnectFirebase();
  }, []);

  // compute latest & levels (tetap dipakai)
  const tempLatest = last(temperatureData);
  const coLatest = last(coData);
  const nh3Latest = last(ammoniaData);
  const humidityLatest = last(humidityData);
  const fanLatest = last(fanData);

  const tempLevel = levelFor("temp", tempLatest);
  const coLevel = levelFor("co", coLatest);
  const nh3Level = levelFor("nh3", nh3Latest);
  const humidityLevel = levelFor("humidity", humidityLatest);

  const overallLevel = overallLevelFromLevels(tempLevel, coLevel, nh3Level);
  const statusText = statusTextFromOverall(overallLevel);
  const circleGradient = getCircleGradient(overallLevel);

  // gabungkan series ke logs
  const logs = useMemo(() => buildLogsFromSeries({ temperatureData, coData, ammoniaData, humidityData, fanData }), [temperatureData, coData, ammoniaData, humidityData, fanData]);

  // persist logs to localStorage setiap kali berubah
  useEffect(() => {
    if (!logs || !Array.isArray(logs)) return;
    try {
      saveLogsToLocalStorage(logs);
    } catch (e) {
      // ignore
    }
  }, [logs]);

  // pagination helpers
  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  useEffect(()=> {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]);

  const visibleLogs = useMemo(() => logs.slice((page-1)*pageSize, page*pageSize), [logs, page]);

  // export CSV / copy
  const handleExportCSV = () => {
    const csv = toCSV(logs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `air-quality-logs-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const csv = toCSV(logs);
    try {
      await navigator.clipboard.writeText(csv);
      alert("CSV copied to clipboard");
    } catch {
      alert("Gagal menyalin ke clipboard — coba export CSV");
    }
  };

  // LOGOUT: hapus cookie & localStorage, disconnect firebase, redirect ke login
  const handleLogout = () => {
    try {
      // remove cookie so middleware/login checks fail
      document.cookie = "auth_token=; path=/; max-age=0";
    } catch (e) {
      // ignore
    }
    try {
      localStorage.removeItem("auth_token");
    } catch (e) {}
    try {
      // optional: stop any firebase connections immediately
      disconnectFirebase();
    } catch (e) {}
    router.push("/login");
  };

  const CustomTooltip = ({ active, payload, label, color, title }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-md shadow-md p-2" style={{ backgroundColor: "white", border: "1px solid #E5E7EB" }}>
          <p className="text-sm font-semibold" style={{ color: color, marginBottom: "2px" }}>{label}</p>
          <p className="text-sm" style={{ color: color ?? "#047857" }}>{title} : <span className="font-semibold">{payload[0].value}</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#F6FAF6] p-4 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <h1 className="text-xl font-semibold text-gray-800">Sistem Monitoring Kualitas Udara</h1>

        {/* Logout button (added) */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleLogout}
            className="px-3 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 shadow-sm"
            title="Logout"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Air Quality Status */}
      <div className="flex flex-col items-center justify-center my-8">
        <div className="relative w-48 h-48 flex items-center justify-center rounded-full">
          <div className="absolute inset-0 rounded-full animate-pulse-ring" style={{ background: `linear-gradient(135deg, ${circleGradient.from} 0%, ${circleGradient.to} 100%)` }} />
          <div className="absolute bottom-0 overflow-hidden rounded-full w-full h-full">
            <svg className="absolute bottom-0" viewBox="0 0 200 100" preserveAspectRatio="none">
              <path className="wave" d="M0 30 Q 75 10, 150 30 T 300 30 T 450 30 T 600 30 V100 H0 Z" fill="rgba(255,255,255,0.5)" />
            </svg>
            <svg className="absolute bottom-0 opacity-60" viewBox="0 0 200 100" preserveAspectRatio="none">
              <path className="wave2" d="M0 30 Q 75 10, 150 30 T 300 30 T 450 30 T 600 30 V100 H0 Z" fill="rgba(255,255,255,0.3)" />
            </svg>
            <svg className="absolute bottom-0 opacity-40" viewBox="0 0 200 100" preserveAspectRatio="none">
              <path className="wave3" d="M0 32 Q 75 12, 150 32 T 300 32 T 450 32 T 600 32 V100 H0 Z" fill="rgba(255,255,255,0.2)" />
            </svg>
          </div>
          <div className="absolute inset-0 rounded-full opacity-30" style={{ border: `10px solid ${circleGradient.border}` }} />
        </div>
        <p className="mt-4 text-lg font-medium" style={{ color: circleGradient.text }}>{statusText}</p>
      </div>

      {/* Data Cards */}
      <div className="grid grid-cols-2 gap-4 my-8">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Suhu lingkungan</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(tempLevel) }}>{tempLatest ?? "-"}°C</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Karbon monoksida</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(coLevel) }}>{coLatest ?? "-"}ppm</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Amonia</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(nh3Level) }}>{nh3Latest ?? "-"}ppm</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Kelembapan</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(humidityLevel) }}>{humidityLatest ?? "-"}%</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Status Kipas</p>
          <p className={`text-xl font-bold ${fanLatest === 1 ? "text-green-700" : "text-red-600"}`}>
            { fanLatest === 1 ? "Aktif" : fanLatest === 0 ? "Mati" : fanLatest === 2 ? "2 Aktif" : "-" }
          </p>
        </div>
      </div>

      {/* Charts Section (sama seperti sebelumnya) */}
      <div className="overflow-x-auto flex space-x-4 pb-4">
        {/* chart suhu */}
        <div className="bg-white p-4 rounded-lg shadow-sm min-w-[520px]">
          <p className="text-lg font-semibold text-gray-800 mb-4">Riwayat Temperatur Suhu (°C)</p>
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={temperatureData}>
                <defs>
                  <linearGradient id="tempColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34D399" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#34D399" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#6B7280", fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fill: "#6B7280", fontSize: 12 }} tickLine={false} width={30} label={{ value: "°C", angle: -90, position: "insideLeft", fill: "#6B7280", fontSize: 12 }} />
                <Tooltip content={<CustomTooltip color="#047857" title="Suhu" />} />
                <Area type="monotone" dataKey="value" stroke="#047857" strokeWidth={2} fill="url(#tempColor)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* chart co */}
        <div className="bg-white p-4 rounded-lg shadow-sm min-w-[520px]">
          <p className="text-lg font-semibold text-gray-800 mb-4">Riwayat Kadar Karbon Monoksida (ppm)</p>
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={coData}>
                <defs>
                  <linearGradient id="co2Color" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#60A5FA" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#6B7280", fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fill: "#6B7280", fontSize: 12 }} tickLine={false} width={40} label={{ value: "ppm", angle: -90, position: "insideLeft", fill: "#6B7280", fontSize: 12 }} />
                <Tooltip content={<CustomTooltip color="#2563EB" title="Kadar" />} />
                <Area type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} fill="url(#co2Color)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* chart amonia */}
        <div className="bg-white p-4 rounded-lg shadow-sm min-w-[520px]">
          <p className="text-lg font-semibold text-gray-800 mb-4">Riwayat Kadar Amonia (ppm)</p>
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ammoniaData}>
                <defs>
                  <linearGradient id="amoniaColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FACC15" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#FACC15" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#6B7280", fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fill: "#6B7280", fontSize: 12 }} tickLine={false} width={40} label={{ value: "ppm", angle: -90, position: "insideLeft", fill: "#6B7280", fontSize: 12 }} />
                <Tooltip content={<CustomTooltip color="#CA8A04" title="Kadar" />} />
                <Area type="monotone" dataKey="value" stroke="#CA8A04" strokeWidth={2} fill="url(#amoniaColor)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ======= TABLE LOGS (REPLACED WITH PERSISTENCE) ======= */}
      <div className="bg-white p-5 rounded-xl shadow-md mt-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Log Historis (Tabel)</h2>
          <div className="flex items-center gap-3">
            <button onClick={handleExportCSV} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Export CSV</button>
            <button onClick={handleCopy} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Copy CSV</button>
            <div className="text-sm text-gray-600 ml-2">Total: <span className="font-medium text-gray-800">{logs.length}</span></div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-gray-50">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0">
              <tr className="text-left">
                <th className="py-3 px-4 bg-white text-gray-700 uppercase text-xs tracking-wider border-b">Waktu</th>
                <th className="py-3 px-4 bg-white text-gray-700 uppercase text-xs tracking-wider border-b">Suhu (°C)</th>
                <th className="py-3 px-4 bg-white text-gray-700 uppercase text-xs tracking-wider border-b">CO (ppm)</th>
                <th className="py-3 px-4 bg-white text-gray-700 uppercase text-xs tracking-wider border-b">Amonia (ppm)</th>
                <th className="py-3 px-4 bg-white text-gray-700 uppercase text-xs tracking-wider border-b">Kelembapan (%)</th>
                <th className="py-3 px-4 bg-white text-gray-700 uppercase text-xs tracking-wider border-b">Kipas</th>
                <th className="py-3 px-4 bg-white text-gray-700 uppercase text-xs tracking-wider border-b">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">Tidak ada data</td></tr>
              )}
              {visibleLogs.map((r, idx) => (
                <tr key={r.time} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                  <td className="py-3 px-4 align-top w-56">
                    <div className="font-medium text-gray-800">{new Date(r.time).toLocaleString()}</div>
                    <div className="text-xs text-gray-400">{r.day}</div>
                  </td>

                  <td className="py-3 px-4 align-top">
                    <div className="font-semibold" style={{ color: colorForLevel(r.tempLevel) }}>{r.temp ?? "-"}</div>
                    <div className="text-xs text-gray-400 mt-1">Level: {String(r.tempLevel ?? "-")}</div>
                  </td>

                  <td className="py-3 px-4 align-top">
                    <div className="font-semibold" style={{ color: colorForLevel(r.coLevel) }}>{r.co ?? "-"}</div>
                    <div className="text-xs text-gray-400 mt-1">Level: {String(r.coLevel ?? "-")}</div>
                  </td>

                  <td className="py-3 px-4 align-top">
                    <div className="font-semibold" style={{ color: colorForLevel(r.nh3Level) }}>{r.nh3 ?? "-"}</div>
                    <div className="text-xs text-gray-400 mt-1">Level: {String(r.nh3Level ?? "-")}</div>
                  </td>

                  <td className="py-3 px-4 align-top">
                    <div className="font-semibold" style={{ color: colorForLevel(r.humidityLevel) }}>{r.humidity ?? "-"}</div>
                    <div className="text-xs text-gray-400 mt-1">Level: {String(r.humidityLevel ?? "-")}</div>
                  </td>

                  <td className="py-3 px-4 align-top">
                    <div className="font-medium text-gray-800">{formatFan(r.fan)}</div>
                  </td>

                  <td className="py-3 px-4 align-top w-48">
                    <div style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      borderRadius: 9999,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      background: getCircleGradient(r.overallLevel).from,
                      boxShadow: "0 1px 0 rgba(0,0,0,0.06)"
                    }}>
                      {r.statusText}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">Overall: {String(r.overallLevel ?? "-")}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">Menampilkan {logs.length === 0 ? 0 : Math.min(logs.length, (page - 1) * pageSize + 1)} - {Math.min(logs.length, page * pageSize)} dari {logs.length}</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50">First</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
            <span className="px-2 text-sm">Hal {page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Last</button>
          </div>
        </div>
      </div>
      {/* ==== END TABLE LOGS ==== */}
    </div>
  );
}
