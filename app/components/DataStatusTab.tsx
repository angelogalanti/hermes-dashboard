"use client";

import React, { useState, useMemo } from "react";
import type { DataStatusResponse, AssetStatus, DataFileStatus } from "@/app/lib/types";
import { Card } from "@/app/components/ui";

interface DataStatusTabProps {
  dataStatus: DataStatusResponse | null;
}

// Utility to format file size
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Utility to format row count
function formatRowCount(count: number): string {
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(2) + "M";
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1) + "k";
  }
  return count.toString();
}

// Map category to a display badge and color
function getCategoryBadge(category: string, type?: string) {
  switch (category) {
    case "crypto":
      return {
        label: type === "spot" ? "Crypto Spot" : "Crypto Perp",
        bg: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
        icon: "fa-coins",
      };
    case "forex":
      return {
        label: "Forex",
        bg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        icon: "fa-dollar-sign",
      };
    case "futures":
      return {
        label: "Crypto Basket Future",
        bg: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        icon: "fa-arrow-trend-up",
      };
    default:
      return {
        label: category,
        bg: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
        icon: "fa-file",
      };
  }
}

// Map timeframe to color tag
function getTimeframeColor(tf: string): string {
  const norm = tf.toLowerCase();
  if (norm.endsWith("m")) {
    if (norm === "1m") return "text-orange-400 bg-orange-400/10 border-orange-400/20";
    if (norm === "5m") return "text-amber-400 bg-amber-400/10 border-amber-400/20";
    return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"; // 15m, 30m
  }
  if (norm.endsWith("h")) {
    if (norm === "1h") return "text-sky-400 bg-sky-400/10 border-sky-400/20";
    if (norm === "4h") return "text-blue-400 bg-blue-400/10 border-blue-400/20";
    return "text-indigo-400 bg-indigo-400/10 border-indigo-400/20"; // 2h, 6h, 8h, 12h
  }
  if (norm.endsWith("d") || norm.endsWith("w")) {
    return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
  }
  return "text-slate-400 bg-slate-400/10 border-slate-400/20";
}

export default function DataStatusTab({ dataStatus }: DataStatusTabProps) {
  const [activeCategory, setActiveCategory] = useState<"all" | "crypto" | "forex" | "futures">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Aggregate statistics
  const stats = useMemo(() => {
    if (!dataStatus) return { totalAssets: 0, totalFiles: 0, totalSize: 0, totalRows: 0 };
    
    let totalAssets = 0;
    let totalFiles = 0;
    let totalSize = 0;
    let totalRows = 0;

    const scanList = (list: AssetStatus[]) => {
      totalAssets += list.length;
      list.forEach((asset) => {
        totalFiles += asset.files.length;
        asset.files.forEach((file) => {
          totalSize += file.fileSize;
          totalRows += file.rowCount;
        });
      });
    };

    scanList(dataStatus.crypto || []);
    scanList(dataStatus.forex || []);
    scanList(dataStatus.futures || []);

    return { totalAssets, totalFiles, totalSize, totalRows };
  }, [dataStatus]);

  // Filtered assets list
  const filteredAssets = useMemo(() => {
    if (!dataStatus) return [];

    let combined: (AssetStatus & { firstType?: string })[] = [];

    const addCategory = (list: AssetStatus[], catKey: "crypto" | "forex" | "futures") => {
      list.forEach((asset) => {
        // Track the type of the first file if available (e.g. spot vs perp)
        const firstType = asset.files[0]?.type;
        combined.push({
          ...asset,
          category: catKey,
          firstType,
        });
      });
    };

    if (activeCategory === "all" || activeCategory === "crypto") {
      addCategory(dataStatus.crypto || [], "crypto");
    }
    if (activeCategory === "all" || activeCategory === "forex") {
      addCategory(dataStatus.forex || [], "forex");
    }
    if (activeCategory === "all" || activeCategory === "futures") {
      addCategory(dataStatus.futures || [], "futures");
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      combined = combined.filter((asset) => asset.symbol.toLowerCase().includes(q));
    }

    return combined;
  }, [dataStatus, activeCategory, searchQuery]);

  if (!dataStatus) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-slate-400 mt-6">
        <i className="fas fa-spinner fa-spin text-3xl mb-4 text-indigo-400" />
        <p>Scansione della cache dati in corso...</p>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Aggregate Statistics Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="rounded-lg bg-indigo-500/10 p-3 text-indigo-400 text-xl">
            <i className="fas fa-cubes" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Asset Totali</p>
            <p className="text-2xl font-bold text-slate-100">{stats.totalAssets}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="rounded-lg bg-sky-500/10 p-3 text-sky-400 text-xl">
            <i className="fas fa-file-code" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Timeframe Totali</p>
            <p className="text-2xl font-bold text-slate-100">{stats.totalFiles}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="rounded-lg bg-emerald-500/10 p-3 text-emerald-400 text-xl">
            <i className="fas fa-database" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Record nel Database</p>
            <p className="text-2xl font-bold text-slate-100">{formatRowCount(stats.totalRows)}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="rounded-lg bg-amber-500/10 p-3 text-amber-400 text-xl">
            <i className="fas fa-hard-drive" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Spazio su Disco</p>
            <p className="text-2xl font-bold text-slate-100">{formatBytes(stats.totalSize)}</p>
          </div>
        </Card>
      </div>

      {/* Control panel: Category selectors and Search Bar */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              activeCategory === "all"
                ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/40"
                : "border-slate-700/50 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            Tutti
          </button>
          <button
            onClick={() => setActiveCategory("crypto")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              activeCategory === "crypto"
                ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/40"
                : "border-slate-700/50 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            <i className="fas fa-coins mr-1.5" /> Cripto (Spot/Perp)
          </button>
          <button
            onClick={() => setActiveCategory("forex")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              activeCategory === "forex"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "border-slate-700/50 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            <i className="fas fa-dollar-sign mr-1.5" /> Forex
          </button>
          <button
            onClick={() => setActiveCategory("futures")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              activeCategory === "futures"
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "border-slate-700/50 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            <i className="fas fa-arrow-trend-up mr-1.5" /> Futures (Basket)
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
            <i className="fas fa-search text-xs" />
          </span>
          <input
            type="text"
            placeholder="Cerca asset per simbolo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </Card>

      {/* Assets Grid */}
      {filteredAssets.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-slate-500 text-center">
          <i className="fas fa-search-minus text-3xl mb-3 text-slate-600" />
          <p className="text-sm font-semibold">Nessun asset corrispondente</p>
          <p className="text-xs text-slate-600 mt-1">Prova a cambiare filtri o a ripulire la ricerca.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/60 shadow-lg shadow-black/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700/60 bg-slate-900/30 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Dettagli Timeframe (Intervallo, Periodo, Record, Dimensione)</th>
                <th className="px-6 py-4 text-right">Spazio su Disco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40 text-slate-300">
              {filteredAssets.map((asset) => {
                const badge = getCategoryBadge(asset.category, asset.firstType);
                const totalAssetSize = asset.files.reduce((acc, f) => acc + f.fileSize, 0);

                return (
                  <tr key={asset.symbol} className="hover:bg-slate-800/20 transition-colors">
                    {/* Asset column */}
                    <td className="px-6 py-4 align-top font-bold text-slate-100 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <i className={`fas ${badge.icon} text-sm text-slate-500`} />
                        <span>{asset.symbol}</span>
                      </div>
                    </td>

                    {/* Category column */}
                    <td className="px-6 py-4 align-top whitespace-nowrap">
                      <span className={`inline-block text-[9px] font-semibold px-2 py-0.5 rounded uppercase ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </td>

                    {/* Timeframes list column */}
                    <td className="px-6 py-4 align-top">
                      <div className="space-y-2">
                        {asset.files.map((file) => {
                          const tfColor = getTimeframeColor(file.timeframe);
                          return (
                            <div key={file.timeframe} className="flex flex-wrap items-center gap-4 bg-slate-900/30 border border-slate-800/40 rounded-lg px-3 py-2 text-slate-200">
                              {/* Timeframe pill */}
                              <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 border rounded uppercase ${tfColor} w-20 text-center`}>
                                {file.timeframe}
                              </span>

                              {/* Date range */}
                              <span className="text-[11px] font-mono">
                                <span className="text-slate-500 mr-1.5 font-semibold text-[9px] uppercase tracking-wider">Periodo:</span>
                                {file.startDate} <span className="text-slate-500 mx-1">→</span> {file.endDate}
                              </span>

                              {/* Record count */}
                              <span className="text-[11px] font-mono flex items-center gap-1.5">
                                <span className="text-slate-500 font-semibold text-[9px] uppercase tracking-wider">Record:</span>
                                <i className="fas fa-database text-[10px] text-slate-500" />
                                {formatRowCount(file.rowCount)}
                              </span>

                              {/* File size */}
                              <span className="text-[11px] font-mono ml-auto">
                                <span className="text-slate-500 font-semibold text-[9px] uppercase tracking-wider">Peso:</span>
                                {formatBytes(file.fileSize)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>

                    {/* Total Size column */}
                    <td className="px-6 py-4 align-top text-right font-mono font-bold text-indigo-400 whitespace-nowrap">
                      {formatBytes(totalAssetSize)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
