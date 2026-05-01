"use client";

export default function PopularDishes({ dishes }: { dishes: string[] }) {
  if (!dishes.length) return null;

  return (
    <div className="px-4 pt-4 pb-1 fade-up" style={{ animationDelay: "60ms" }}>
      <div className="flex items-baseline gap-2 mb-2.5 px-0.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">
          Reviewers Love
        </p>
        <span className="text-[10px] text-white/20 font-medium">
          {dishes.length} dish{dishes.length === 1 ? "" : "es"}
        </span>
      </div>

      {/* Horizontally scrollable chips on mobile, wrapped on wider screens */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {dishes.map((name, i) => (
          <span
            key={name}
            className="shrink-0 max-w-[200px] truncate text-[12px] font-semibold px-3 py-1.5 rounded-full transition-colors fade-up"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,107,53,0.18) 0%, rgba(255,107,53,0.10) 100%)",
              border: "1px solid rgba(255,107,53,0.28)",
              color: "#ffb085",
              animationDelay: `${i * 40}ms`,
            }}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
