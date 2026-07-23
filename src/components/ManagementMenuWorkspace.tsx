"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { optimizeImageFile } from "@/lib/clientImageOptimization";

const PLACE_ID = "ChIJa7SNNcl_24ARGN-49KRUqPI";
const FALLBACK_ITEMS = [
  "Rotisserie Chicken",
  "Tri-Tip Sandwich",
  "Miso Butter Salmon",
  "Seasonal Burrata",
  "Smoked Brisket",
  "Chicken Piccata",
  "Prime Rib",
  "Grilled Artichoke",
  "Crispy Calamari",
  "House Meatloaf",
  "Blackened Shrimp Tacos",
  "Chocolate Layer Cake",
].map((name, index) => ({
  name,
  description: null as string | null,
  price: null as number | null,
  source: "sample",
  popularityRank: index < 7 ? index + 1 : null,
}));

interface MenuItem {
  name: string;
  description: string | null;
  price: number | null;
  source: string;
  popularityRank: number | null;
}

interface MenuPage {
  id: string;
  file: File;
  preview: string;
  status: "ready" | "reading" | "done" | "error";
  error?: string;
}

interface DraftItem {
  id: string;
  name: string;
  description: string;
  price: number | null;
  category: string;
  confidence: "high" | "medium" | "low";
  pageNumber: number;
}

function itemKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mergeDraftItems(current: DraftItem[], incoming: DraftItem[]) {
  const merged = new Map(current.map((item) => [itemKey(item.name), item]));
  for (const item of incoming) {
    const key = itemKey(item.name);
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      continue;
    }
    if (item.description.length > existing.description.length) {
      merged.set(key, { ...existing, description: item.description });
    }
  }
  return [...merged.values()];
}

function TopSeven({
  items,
  onItemsChanged,
}: {
  items: MenuItem[];
  onItemsChanged: (items: MenuItem[]) => void;
}) {
  const [selected, setSelected] = useState(
    items.filter((item) => item.popularityRank).sort((a, b) => (a.popularityRank ?? 99) - (b.popularityRank ?? 99)).map((item) => item.name)
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const available = useMemo(() => items.filter((item) =>
    !selected.includes(item.name) && item.name.toLowerCase().includes(query.toLowerCase())
  ), [items, query, selected]);

  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= selected.length) return;
    setSelected((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/management/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rank", placeId: PLACE_ID, names: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ranking could not be saved.");
      onItemsChanged(items.map((item) => ({
        ...item,
        popularityRank: selected.indexOf(item.name) >= 0 ? selected.indexOf(item.name) + 1 : null,
      })));
      setMessage(`${selected.length} management picks saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ranking could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in">
      <section className="py-4 border-b border-white/8">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] uppercase font-bold text-[var(--accent)]">Management’s stated favorites</p><h3 className="text-white text-[17px] font-bold mt-1">Rank Your Top 7</h3><p className="text-white/40 text-[10.5px] leading-relaxed mt-1">Put the item guests order most at #1. Popular 7 pages feature only this ranked set.</p></div><span className="shrink-0 px-2 py-1 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] text-[9px] font-bold">{selected.length}/7</span></div>
      </section>

      <section className="py-3 border-b border-white/8">
        {selected.length ? selected.map((name, index) => (
          <div key={name} className="min-h-14 flex items-center gap-2 border-b border-white/6 last:border-0">
            <span className="w-7 h-7 rounded-md bg-[var(--accent)] text-white flex items-center justify-center text-[11px] font-bold">{index + 1}</span>
            <span className="min-w-0 flex-1 text-white text-[12px] font-bold truncate">{name}</span>
            <button onClick={() => move(index, -1)} disabled={index === 0} className="w-9 h-9 rounded-md bg-white/6 text-white/55 disabled:opacity-20" aria-label={`Move ${name} up`}>↑</button>
            <button onClick={() => move(index, 1)} disabled={index === selected.length - 1} className="w-9 h-9 rounded-md bg-white/6 text-white/55 disabled:opacity-20" aria-label={`Move ${name} down`}>↓</button>
            <button onClick={() => setSelected((current) => current.filter((item) => item !== name))} className="w-9 h-9 text-white/28 text-lg" aria-label={`Remove ${name} from Top 7`}>×</button>
          </div>
        )) : <p className="text-white/32 text-[11px] py-4">Choose the first management favorite below.</p>}
      </section>

      <section className="py-4">
        <label className="block text-white/35 text-[9px] uppercase font-bold">Add a menu item<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the menu" className="mt-2 w-full min-h-11 rounded-md bg-white/7 border border-white/10 px-3 text-white text-[12px] outline-none focus:border-[var(--accent)]" /></label>
        <div className="mt-2 max-h-56 overflow-y-auto border-y border-white/7">
          {available.map((item) => <button key={item.name} onClick={() => setSelected((current) => current.length < 7 ? [...current, item.name] : current)} disabled={selected.length >= 7} className="w-full min-h-12 flex items-center gap-3 text-left border-b border-white/6 last:border-0 disabled:opacity-30"><span className="min-w-0 flex-1 text-white/70 text-[11.5px] truncate">{item.name}</span><span className="text-[var(--accent)] text-[10px] font-bold">Add</span></button>)}
          {!available.length && <p className="text-white/28 text-[10.5px] py-4">No other matching menu items.</p>}
        </div>
        {message && <p className="text-emerald-300 text-[10px] mt-3">{message}</p>}
        <button onClick={save} disabled={saving || !selected.length} className="w-full min-h-11 mt-4 rounded-md bg-[var(--accent)] text-white text-[11px] font-bold disabled:opacity-35">{saving ? "Saving…" : "Save Management Top 7"}</button>
      </section>
    </div>
  );
}

function MenuScanner({ onPublished }: { onPublished: (items: MenuItem[]) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const [pages, setPages] = useState<MenuPage[]>([]);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].filter((file) => file.type.startsWith("image/"));
    const next = files.slice(0, Math.max(0, 12 - pages.length)).map((file) => {
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.push(preview);
      return { id: crypto.randomUUID(), file, preview, status: "ready" as const };
    });
    setPages((current) => [...current, ...next]);
    setMessage("");
    event.target.value = "";
  };

  const removePage = (id: string) => {
    setPages((current) => {
      const removed = current.find((page) => page.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.preview);
        previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== removed.preview);
      }
      return current.filter((page) => page.id !== id);
    });
  };

  const readPages = async () => {
    setProcessing(true);
    setMessage("");
    setDraft([]);
    setPageUrls([]);
    let accumulated: DraftItem[] = [];
    const urls: string[] = [];
    let serviceError = "";

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      setPages((current) => current.map((item) => item.id === page.id ? { ...item, status: "reading", error: undefined } : item));
      try {
        const optimized = await optimizeImageFile(page.file);
        if (optimized.size > 9 * 1024 * 1024) throw new Error("This photo is still too large. Retake it closer to the page.");
        const form = new FormData();
        form.append("page", optimized);
        form.append("placeId", PLACE_ID);
        form.append("pageNumber", String(index + 1));
        const response = await fetch("/api/management/menu-extract", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "This page could not be read.");
        const incoming = (result.items ?? []).map((item: Omit<DraftItem, "id" | "pageNumber">) => ({
          ...item,
          id: crypto.randomUUID(),
          pageNumber: index + 1,
        }));
        accumulated = mergeDraftItems(accumulated, incoming);
        if (typeof result.pageUrl === "string") urls.push(result.pageUrl);
        setDraft([...accumulated]);
        setPageUrls([...urls]);
        setPages((current) => current.map((item) => item.id === page.id ? { ...item, status: "done" } : item));
      } catch (error) {
        const detail = error instanceof Error ? error.message : "This page could not be read.";
        if (detail.includes("AI service")) serviceError = detail;
        setPages((current) => current.map((item) => item.id === page.id ? { ...item, status: "error", error: detail } : item));
      }
    }
    setProcessing(false);
    setMessage(accumulated.length
      ? `${accumulated.length} menu items found. Review them before publishing.`
      : serviceError || "No menu items were found. Retake the pages in brighter, straighter light.");
  };

  const updateDraft = (id: string, field: "name" | "description", value: string) => {
    setDraft((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const publish = async () => {
    const valid = draft.filter((item) => item.name.trim());
    if (!valid.length) return;
    setPublishing(true);
    setMessage("");
    try {
      const response = await fetch("/api/management/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", placeId: PLACE_ID, items: valid, pageUrls }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The menu could not be published.");
      onPublished(valid.map((item) => ({
        name: item.name.trim(),
        description: item.description.trim() || null,
        price: item.price,
        source: "merchant",
        popularityRank: null,
      })));
      setMessage(`${result.count} management-verified menu items published.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The menu could not be published.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fade-in">
      <section className="py-4 border-b border-white/8">
        <p className="text-[9px] uppercase font-bold text-sky-300">Fast menu intake</p><h3 className="text-white text-[17px] font-bold mt-1">Photograph Your Menu</h3><p className="text-white/40 text-[10.5px] leading-relaxed mt-1">Add every page. SeeFood reads it into an editable draft; nothing goes live until management confirms it.</p>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={addFiles} className="hidden" />
        <input ref={libraryRef} type="file" accept="image/*" multiple onChange={addFiles} className="hidden" />
        <div className="grid grid-cols-2 gap-2 mt-4"><button onClick={() => cameraRef.current?.click()} className="min-h-11 rounded-md bg-white text-black text-[11px] font-bold">Take a Menu Photo</button><button onClick={() => libraryRef.current?.click()} className="min-h-11 rounded-md border border-white/12 text-white/65 text-[11px] font-bold">Choose Menu Pages</button></div>
      </section>

      {pages.length > 0 && <section className="py-4 border-b border-white/8"><div className="flex items-end justify-between"><p className="text-white text-[12px] font-bold">Menu pages</p><span className="text-white/30 text-[9px]">{pages.length}/12</span></div><div className="flex gap-2 overflow-x-auto no-scrollbar mt-3">{pages.map((page, index) => <div key={page.id} className="relative w-24 shrink-0"><div className="aspect-[3/4] rounded-md overflow-hidden bg-white/5 border" style={{ borderColor: page.status === "done" ? "#54dfa0" : page.status === "error" ? "#ff7b78" : "rgba(255,255,255,.1)" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={page.preview} alt={`Menu page ${index + 1}`} className="w-full h-full object-cover" />{page.status === "reading" && <span className="absolute inset-0 bg-black/65 flex items-center justify-center text-white text-[9px] font-bold">Reading…</span>}{page.status === "done" && <span className="absolute left-1.5 bottom-1.5 px-1.5 py-1 rounded bg-emerald-400 text-black text-[8px] font-bold">READ</span>}{page.status === "error" && <span className="absolute left-1.5 bottom-1.5 px-1.5 py-1 rounded bg-rose-400 text-black text-[8px] font-bold">RETRY</span>}</div><button onClick={() => removePage(page.id)} disabled={processing} className="absolute -right-1.5 -top-1.5 w-6 h-6 rounded-full bg-black border border-white/15 text-white/70 text-sm" aria-label={`Remove menu page ${index + 1}`}>×</button><p className="text-white/30 text-[8px] text-center mt-1">Page {index + 1}</p></div>)}</div>{draft.length > 0 && pages.some((page) => page.error) && <p className="text-rose-300 text-[9.5px] mt-2">{pages.find((page) => page.error)?.error}</p>}<button onClick={readPages} disabled={processing} className="w-full min-h-11 mt-4 rounded-md bg-sky-300 text-black text-[11px] font-bold disabled:opacity-40">{processing ? `Reading ${pages.filter((page) => page.status === "done").length + 1} of ${pages.length}…` : draft.length ? "Read All Pages Again" : "Generate Menu Items"}</button></section>}

      {draft.length > 0 && <section className="py-4"><div className="flex items-end justify-between"><div><p className="text-[9px] uppercase font-bold text-emerald-300">Management review</p><h3 className="text-white text-[15px] font-bold mt-1">{draft.length} items found</h3></div><button onClick={() => setDraft((current) => [...current, { id: crypto.randomUUID(), name: "", description: "", price: null, category: "Other", confidence: "high", pageNumber: pages.length }])} className="min-h-9 px-3 rounded-md border border-white/12 text-white/60 text-[10px] font-bold">Add Missing Item</button></div><div className="mt-3 border-y border-white/8">{draft.map((item, index) => <div key={item.id} className="py-3 border-b border-white/7 last:border-0"><div className="flex items-center gap-2"><span className="text-white/25 text-[9px] tabular-nums">{index + 1}</span><input value={item.name} onChange={(event) => updateDraft(item.id, "name", event.target.value)} aria-label={`Menu item ${index + 1} name`} placeholder="Menu item name" className="min-w-0 flex-1 bg-transparent text-white text-[12px] font-bold outline-none border-b border-transparent focus:border-[var(--accent)]" /><button onClick={() => setDraft((current) => current.filter((candidate) => candidate.id !== item.id))} className="w-8 h-8 text-white/25 text-lg" aria-label={`Remove ${item.name || `menu item ${index + 1}`}`}>×</button></div><textarea value={item.description} onChange={(event) => updateDraft(item.id, "description", event.target.value)} aria-label={`${item.name || `Menu item ${index + 1}`} description`} placeholder="Description (optional)" rows={item.description ? 2 : 1} className="w-full mt-1.5 ml-5 pr-5 resize-none bg-transparent text-white/42 text-[10px] leading-relaxed outline-none" /><p className="ml-5 mt-1 text-white/22 text-[8px]">{item.category} · page {item.pageNumber} · {item.confidence} confidence{item.price !== null ? ` · $${item.price.toFixed(2)} captured` : ""}</p></div>)}</div>{message && <p className="text-emerald-300 text-[10px] mt-3">{message}</p>}<button onClick={publish} disabled={publishing || !draft.some((item) => item.name.trim())} className="w-full min-h-11 mt-4 rounded-md bg-[var(--accent)] text-white text-[11px] font-bold disabled:opacity-35">{publishing ? "Publishing…" : `Confirm & Publish ${draft.filter((item) => item.name.trim()).length} Items`}</button></section>}
      {!draft.length && message && <div className="py-4"><p className="text-white/45 text-[10.5px]">{message}</p><button onClick={() => { setDraft([{ id: crypto.randomUUID(), name: "", description: "", price: null, category: "Manual", confidence: "high", pageNumber: 1 }]); setMessage(""); }} className="mt-3 min-h-10 px-3 rounded-md border border-white/12 text-white/65 text-[10px] font-bold">Build Menu Manually</button></div>}
    </div>
  );
}

export default function ManagementMenuWorkspace({ onClose, initialMode = "rank" }: { onClose: () => void; initialMode?: "rank" | "scan" }) {
  const [mode, setMode] = useState<"rank" | "scan">(initialMode);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    void fetch(`/api/management/menu?placeId=${encodeURIComponent(PLACE_ID)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((result) => setItems(result.items?.length ? result.items : FALLBACK_ITEMS))
      .catch((error) => { if (error?.name !== "AbortError") setItems(FALLBACK_ITEMS); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const mergePublished = (published: MenuItem[]) => {
    setItems((current) => {
      const byName = new Map(current.map((item) => [itemKey(item.name), item]));
      for (const item of published) byName.set(itemKey(item.name), { ...byName.get(itemKey(item.name)), ...item });
      return [...byName.values()];
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Manage menu" onClick={onClose}>
      <div className="w-full max-w-3xl h-[94vh] overflow-y-auto rounded-t-2xl bg-[#141414] border-t border-white/12 slide-up" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-20 bg-[#141414]/96 backdrop-blur px-4 pt-3 border-b border-white/8"><div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3" /><div className="flex items-center gap-3 pb-3"><div className="min-w-0 flex-1"><p className="text-[9px] uppercase font-bold text-[var(--accent)]">LRay’s Kitchen</p><h2 className="text-white text-[19px] font-bold">Menu Setup</h2></div><button onClick={onClose} className="w-9 h-9 rounded-full bg-white/7 text-white/60 text-lg" aria-label="Close">×</button></div><div className="grid grid-cols-2">{([["rank", "Top 7"], ["scan", "Scan Menu"]] as const).map(([value, label]) => <button key={value} onClick={() => setMode(value)} className="min-h-11 text-[10.5px] font-bold border-b-2" style={{ color: mode === value ? "white" : "rgba(255,255,255,.35)", borderColor: mode === value ? "var(--accent)" : "transparent" }}>{label}</button>)}</div></div>
        <div className="px-4 pb-8">{loading ? <div className="py-24 text-center text-white/35 text-[11px]">Loading management menu…</div> : mode === "rank" ? <TopSeven key={items.map((item) => `${item.name}:${item.popularityRank}`).join("|")} items={items} onItemsChanged={setItems} /> : <MenuScanner onPublished={mergePublished} />}</div>
      </div>
    </div>
  );
}
