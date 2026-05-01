"use client";

export default function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 bg-[var(--surface-0)] flex flex-col items-center justify-center z-50 px-6 fade-in">
      {/* Branded ring with gradient stroke */}
      <div className="relative mb-7">
        <div
          className="w-20 h-20 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, var(--accent) 280deg, transparent 360deg)",
            animation: "spin 1.4s linear infinite",
            mask: "radial-gradient(circle, transparent 28px, black 30px)",
            WebkitMask: "radial-gradient(circle, transparent 28px, black 30px)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[26px]" style={{ filter: "saturate(1.1)" }}>
            🍽️
          </div>
        </div>
      </div>

      {/* Wordmark */}
      <p className="text-white text-[15px] font-bold tracking-tight mb-1.5">
        seeFood
      </p>

      {/* Message */}
      <p className="text-white/45 text-[13px] font-medium">{message}</p>
    </div>
  );
}
