"use client";

export default function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center z-50">
      {/* Animated food icon */}
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-2 border-[#ff6b35]/30 border-t-[#ff6b35] animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl">
          🍽
        </span>
      </div>

      <p className="text-white/60 text-sm font-medium animate-pulse">
        {message}
      </p>
    </div>
  );
}
