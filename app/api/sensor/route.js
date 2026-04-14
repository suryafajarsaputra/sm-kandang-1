import { insertSensorData } from "@/lib/database.js";

export async function POST(req) {
  const data = await req.json();
  await insertSensorData(data);
  return Response.json({ success: true });
}
