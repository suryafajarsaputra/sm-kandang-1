"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simpel auth hardcoded (ganti dengan Firebase/API jika perlu)
    await new Promise((r) => setTimeout(r, 400)); // small UX delay
    if (username === "admin" && password === "admin123") {
      // set cookie supaya middleware bisa baca
      document.cookie = "auth_token=logged_in; path=/; max-age=86400"; // 1 hari
      // localStorage untuk komponen client (dashboard Anda memakai ini)
      localStorage.setItem("auth_token", "logged_in");
      router.push("/dashboard");
    } else {
      setError("Username atau password salah");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F6FAF6" }}>
      <div className="max-w-3xl w-full px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Left: Visual / Branding */}
          <div className="hidden md:flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 to-white rounded-xl p-8 shadow-md">
            <div
              className="rounded-full w-28 h-28 flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg,#34D399 0%, #047857 100%)",
                boxShadow: "0 8px 30px rgba(4,120,87,0.12)",
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2C10 5 7 6 5 9s2 6 2 6 1 1 5 1 6-1 6-1 1-3-1-6-5-4-5-7z" fill="white" />
              </svg>
            </div>

            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Sistem Monitoring Kualitas Udara kandang</h2>
            <p className="text-sm text-gray-500 text-center max-w-sm">
              Dashboard real-time untuk memantau kualitas udara kandang. Masuk untuk melihat grafik, log, dan status perangkat.
            </p>

            
          </div>

          {/* Right: Form */}
          <div className="bg-white rounded-xl p-6 md:p-8 shadow-lg transform transition duration-200 hover:scale-[1.01]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">Masuk</h1>
                <p className="text-sm text-gray-500">Masukkan kredensial Anda untuk mengakses dashboard.</p>
              </div>
              <div className="text-sm text-emerald-600 font-medium">Versi internal</div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-100">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <label className="block">
                <span className="text-sm text-gray-600">Username</span>
                <input
                  aria-label="username"
                  className="
                            mt-1 w-full rounded-lg border border-gray-200 shadow-sm
                            p-3
                            text-gray-900 placeholder:text-gray-400
                            bg-white
                            focus:outline-none focus:ring-2 focus:ring-emerald-300
                            focus:border-emerald-500
                            "
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>

              <label className="block relative">
                <span className="text-sm text-gray-600">Password</span>
                <input
                  aria-label="password"
                  className="
                            mt-1 w-full rounded-lg border border-gray-200 shadow-sm
                            p-3
                            text-gray-900 placeholder:text-gray-400
                            bg-white
                            focus:outline-none focus:ring-2 focus:ring-emerald-300
                            focus:border-emerald-500
                            "
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-[38px] text-sm text-gray-500"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPassword ? "Sembunyikan" : "Tampilkan"}
                </button>
              </label>

              <div className="flex items-center justify-between text-sm">
                <label className="inline-flex items-center gap-2 text-gray-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300" />
                  <span>Ingat saya</span>
                </label>
                <a className="text-emerald-600 hover:underline" href="#" onClick={(e) => e.preventDefault()}>
                  Lupa password?
                </a>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-white"
                style={{
                  background: "linear-gradient(90deg,#16A34A 0%,#047857 100%)",
                  boxShadow: "0 8px 20px rgba(6,95,70,0.12)",
                }}
              >
                {loading ? "Memproses..." : "Masuk ke Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
