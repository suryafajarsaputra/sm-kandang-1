// lib/database.js
"use server";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function initDB() {
  const db = await open({
    filename: "./monitoring.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      temperature REAL NOT NULL,
      co2 REAL NOT NULL,
      nh3 REAL NOT NULL,
      overall TEXT NOT NULL
    );
  `);

  return db;
}

export async function insertSensorData({ temperature, co2, nh3, overall }) {
  const db = await initDB();
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);

  await db.run(
    "INSERT INTO sensor_data (timestamp, temperature, co2, nh3, overall) VALUES (?, ?, ?, ?, ?)",
    [timestamp, temperature, co2, nh3, overall]
  );

  console.log(`✅ Tersimpan ke DB: Suhu=${temperature}, CO₂=${co2}, NH₃=${nh3}, Overall=${overall}`);
}
