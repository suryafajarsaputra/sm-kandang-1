"use client";

import React, { useEffect, useState } from "react";
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
} from "./services.js";

export default function Home() {
  const [temperatureData, setTemperatureData] = useState(initialTemperatureData);
  const [coData, setCoData] = useState(initialCoData);
  const [ammoniaData, setAmmoniaData] = useState(initialAmmoniaData);
  const [humidityData, setHumidityData] = useState(initialHumidityData);
  const [fanData, setFanData] = useState(initialFanData);

  // ✅ gunakan service untuk koneksi realtime + historis
  useEffect(() => {
    connectToFirebase(
      ({ temperatureData, coData, ammoniaData, humidityData, fanData }) => {
        const fmt = (arr) =>
          Array.isArray(arr)
            ? arr.map((d) => ({
                ...d,
                // supaya XAxis menampilkan jam:menit tanpa ubah struktur UI
                day: new Date(d.time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }))
            : [];

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

  // compute latest & levels
  const tempLatest = last(temperatureData);
  const coLatest = last(coData);
  const nh3Latest = last(ammoniaData);
  const humidityLatest = last(humidityData);
  const fanLatest = last(fanData);

  const tempLevel = levelFor("temp", tempLatest);
  const coLevel = levelFor("co", coLatest); // gunakan "co" sesuai services.js
  const nh3Level = levelFor("nh3", nh3Latest);
  const humidityLevel = levelFor("humidity", humidityLatest);

  const overallLevel = overallLevelFromLevels(tempLevel, coLevel, nh3Level);
  const statusText = statusTextFromOverall(overallLevel);
  const circleGradient = getCircleGradient(overallLevel);

  const CustomTooltip = ({ active, payload, label, color, title }) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="rounded-md shadow-md p-2"
          style={{
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: color, marginBottom: "2px" }}
          >
            {label}
          </p>
          <p className="text-sm" style={{ color: color ?? "#047857" }}>
            {title} : <span className="font-semibold">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#F6FAF6] p-4 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <h1 className="text-xl font-semibold text-gray-800">
          Sistem Monitoring Kualitas Udara
        </h1>
      </div>

      {/* Air Quality Status */}
      <div className="flex flex-col items-center justify-center my-8">
        <div className="relative w-48 h-48 flex items-center justify-center rounded-full">
          <div
            className="absolute inset-0 rounded-full animate-pulse-ring"
            style={{
              background: `linear-gradient(135deg, ${circleGradient.from} 0%, ${circleGradient.to} 100%)`,
            }}
          />
          <div className="absolute bottom-0 overflow-hidden rounded-full w-full h-full">
            <svg
              className="absolute bottom-0"
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
            >
              <path
                className="wave"
                d="M0 30 Q 75 10, 150 30 T 300 30 T 450 30 T 600 30 V100 H0 Z"
                fill="rgba(255,255,255,0.5)"
              />
            </svg>
            <svg
              className="absolute bottom-0 opacity-60"
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
            >
              <path
                className="wave2"
                d="M0 30 Q 75 10, 150 30 T 300 30 T 450 30 T 600 30 V100 H0 Z"
                fill="rgba(255,255,255,0.3)"
              />
            </svg>
            <svg
              className="absolute bottom-0 opacity-40"
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
            >
              <path
                className="wave3"
                d="M0 32 Q 75 12, 150 32 T 300 32 T 450 32 T 600 32 V100 H0 Z"
                fill="rgba(255,255,255,0.2)"
              />
            </svg>
          </div>
          <div
            className="absolute inset-0 rounded-full opacity-30"
            style={{ border: `10px solid ${circleGradient.border}` }}
          />
        </div>
        <p className="mt-4 text-lg font-medium" style={{ color: circleGradient.text }}>
          {statusText}
        </p>
      </div>

      {/* Data Cards */}
      <div className="grid grid-cols-2 gap-4 my-8">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Suhu lingkungan</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(tempLevel) }}>
            {tempLatest ?? "-"}°C
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Karbon monoksida</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(coLevel) }}>
            {coLatest ?? "-"}ppm
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Amonia</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(nh3Level) }}>
            {nh3Latest ?? "-"}ppm
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Kelembapan</p>
          <p className="text-xl font-bold" style={{ color: colorForLevel(humidityLevel) }}>
            {humidityLatest ?? "-"}%
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600">Status Kipas</p>
          <p
            className={`text-xl font-bold ${fanLatest === 1 ? "text-green-700" : "text-red-600"}`}
          >
            {fanLatest === 1 ? "Aktif" : fanLatest === 0 ? "Mati" : "-"}
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="overflow-x-auto flex space-x-4 pb-4">
        {/* chart suhu */}
        <div className="bg-white p-4 rounded-lg shadow-sm min-w-[520px]">
          <p className="text-lg font-semibold text-gray-800 mb-4">
            Riwayat Temperatur Suhu (°C)
          </p>
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
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 12 }}
                  tickLine={false}
                  width={30}
                  label={{
                    value: "°C",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#6B7280",
                    fontSize: 12,
                  }}
                />
                <Tooltip content={<CustomTooltip color="#047857" title="Suhu" />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#047857"
                  strokeWidth={2}
                  fill="url(#tempColor)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* chart co (karbon monoksida) */}
        <div className="bg-white p-4 rounded-lg shadow-sm min-w-[520px]">
          <p className="text-lg font-semibold text-gray-800 mb-4">
            Riwayat Kadar Karbon Monoksida (ppm)
          </p>
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
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 12 }}
                  tickLine={false}
                  width={40}
                  label={{
                    value: "ppm",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#6B7280",
                    fontSize: 12,
                  }}
                />
                <Tooltip content={<CustomTooltip color="#2563EB" title="Kadar" />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fill="url(#co2Color)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* chart amonia */}
        <div className="bg-white p-4 rounded-lg shadow-sm min-w-[520px]">
          <p className="text-lg font-semibold text-gray-800 mb-4">
            Riwayat Kadar Amonia (ppm)
          </p>
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
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 12 }}
                  tickLine={false}
                  width={40}
                  label={{
                    value: "ppm",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#6B7280",
                    fontSize: 12,
                  }}
                />
                <Tooltip content={<CustomTooltip color="#CA8A04" title="Kadar" />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#CA8A04"
                  strokeWidth={2}
                  fill="url(#amoniaColor)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
