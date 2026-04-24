"use client";

export default function PopularDishes({ dishes }: { dishes: string[] }) {
  if (!dishes.length) return null;

  return (
    <div className="px-4 pt-3 pb-1">
      <p className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-semibold mb-2">
        Mentioned in reviews
      </p>
      <div className="flex gap-2 flex-wrap">
        {dishes.map((name) => (
          <span
            key={name}
            className="bg-[#ff6b35]/10 border border-[#ff6b35]/25 text-[#ff8555] text-[11px] font-semibold px-3 py-1 rounded-full max-w-[180px] truncate"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
