// scripts/seed.js
import { insertSensorData } from "../lib/database.js";

const dummyData = [
  { temperature: 28.5, co2: 450, nh3: 210, overall: "good" },
  { temperature: 32.1, co2: 1100, nh3: 330, overall: "warn" },
  { temperature: 36.4, co2: 1600, nh3: 700, overall: "bad" },
];

async function seed() {
  console.log("🌱 Menambahkan data dummy ke database...");
  for (const data of dummyData) {
    await insertSensorData(data);
    console.log(`✅ Data masuk:`, data);
  }
  console.log("Selesai!");
  process.exit(0);
}

seed();
