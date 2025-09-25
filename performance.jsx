import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// --- Helper: Yahoo Finance chart endpoint (often works without API key)
// We normalize prices to 100 at the start of the visible window.
const YF_URL = (ticker, range = "5y", interval = "1mo") =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;

const TICKERS = [
  { symbol: "FXAIX", name: "Fidelity 500 Index" },
  { symbol: "FFTHX", name: "Fidelity Freedom 2035" },
  { symbol: "JEPI", name: "JPMorgan Equity Premium Income" },
  { symbol: "SCHD", name: "Schwab U.S. Dividend Equity" },
  { symbol: "O", name: "Realty Income" },
];

// Format timestamp to YYYY-MM label
function fmtMonth(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function fetchSeries(ticker, abortSignal) {
  const res = await fetch(YF_URL(ticker), { signal: abortSignal });
  if (!res.ok) throw new Error(`Failed to fetch ${ticker}: ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(`No data for ${ticker}`);
  const ts = r.timestamp || [];
  const close = r.indicators?.quote?.[0]?.close || [];

  // Pair timestamps with close, filter out nulls
  const rows = ts
    .map((t, i) => ({ date: t, close: close[i] }))
    .filter((x) => x.close != null);

  if (!rows.length) throw new Error(`Empty series for ${ticker}`);

  // Normalize to 100 at first non-null point
  const base = rows[0].close;
  const norm = rows.map((x) => ({ date: fmtMonth(x.date), [ticker]: (x.close / base) * 100 }));
  return norm;
}

function mergeByDate(seriesArray) {
  const map = new Map();
  for (const series of seriesArray) {
    for (const row of series) {
      if (!map.has(row.date)) map.set(row.date, { date: row.date });
      Object.assign(map.get(row.date), row);
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export default function App() {
  const [range, setRange] = useState("5y");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [enabled, setEnabled] = useState(
    Object.fromEntries(TICKERS.map((t) => [t.symbol, true]))
  );

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError("");
        const series = await Promise.all(
          TICKERS.map((t) => fetchSeries(t.symbol, controller.signal).catch((e) => {
            // If a symbol fails (e.g., mutual funds sometimes block), keep going
            console.warn(e);
            return [];
          }))
        );
        const merged = mergeByDate(series.filter((s) => s.length));
        if (!merged.length) throw new Error("모든 티커의 데이터를 불러오지 못했습니다. (CORS 또는 공급자 차단)");
        setData(merged);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [range]);

  const activeKeys = useMemo(() => TICKERS.filter((t) => enabled[t.symbol]).map((t) => t.symbol), [enabled]);

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">5-Year Performance Chart</h1>
            <p className="text-sm text-neutral-600">FXAIX · FFTHX · JEPI · SCHD · O (정규화 기준=100)</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={range === "1y" ? "default" : "outline"} onClick={() => setRange("1y")}>1Y</Button>
            <Button variant={range === "5y" ? "default" : "outline"} onClick={() => setRange("5y")}>5Y</Button>
          </div>
        </header>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4 sm:p-6">
            {loading && (
              <div className="flex items-center gap-2 text-neutral-600"><Loader2 className="h-4 w-4 animate-spin"/> 불러오는 중…</div>
            )}
            {error && (
              <div className="text-red-600 text-sm">오류: {error}<br/>브라우저에서 야후 차트 API를 차단(CORS)할 수 있습니다. VPN/브라우저를 바꾸거나, 티커를 개별적으로 새로 고침해 보세요.</div>
            )}

            {!loading && data.length > 0 && (
              <div className="w-full h-[420px]">
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} tickFormatter={(v) => `${v.toFixed(0)}`} />
                    <Tooltip formatter={(v) => v.toFixed(2)} />
                    <Legend />
                    {TICKERS.map((t) => (
                      enabled[t.symbol] ? (
                        <Line key={t.symbol} type="monotone" dataKey={t.symbol} dot={false} strokeWidth={2} />
                      ) : null
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TICKERS.map((t) => (
            <div key={t.symbol} className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border">
              <div>
                <div className="font-medium">{t.symbol}</div>
                <div className="text-sm text-neutral-600">{t.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`sw-${t.symbol}`} className="text-sm">표시</Label>
                <Switch id={`sw-${t.symbol}`} checked={enabled[t.symbol]} onCheckedChange={(v) => setEnabled((s) => ({ ...s, [t.symbol]: v }))} />
              </div>
            </div>
          ))}
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-6 text-sm text-neutral-700 space-y-2">
            <p>📌 방법: 각 티커의 월별 종가를 가져와 처음 시점의 값을 100으로 정규화하여 비교합니다. (배당 재투자 효과는 포함되지 않을 수 있습니다.)</p>
            <p>⚠️ 주의: 일부 뮤추얼펀드(FXAPIX/FFTHX 등)는 야후 차트 API에서 CORS/권한으로 차단될 수 있습니다. 그 경우 스위치를 꺼서 숨기거나, 다른 브라우저를 시도해 보세요.</p>
            <p>💡 팁: 상단에서 1Y/5Y 범위를 바꿔볼 수 있습니다. 기본은 5Y입니다.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
