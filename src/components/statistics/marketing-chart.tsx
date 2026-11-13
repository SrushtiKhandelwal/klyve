"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailyBarChart } from "./daily-bar-chart";

// The daily chart on Statistics, one measure at a time (tabs), because emails
// sent and clicks are very different sizes: on a shared axis the clicks would
// be invisible. Each tab keeps its own scale.

type Day = { day: string; sent: number; opens: number; clicks: number };

const METRICS = [
  { key: "sent", label: "Emails sent", unit: ["email sent", "emails sent"] },
  { key: "opens", label: "Unique opens", unit: ["person opened", "people opened"] },
  { key: "clicks", label: "Unique clicks", unit: ["person clicked", "people clicked"] },
] as const;

export function MarketingChart({ daily, zoneLabel }: { daily: Day[]; zoneLabel: string }) {
  return (
    <Tabs defaultValue="sent">
      <TabsList aria-label="Choose what the chart shows" className="max-w-full overflow-x-auto">
        {METRICS.map((m) => (
          <TabsTrigger key={m.key} value={m.key}>
            {m.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {METRICS.map((m) => (
        <TabsContent key={m.key} value={m.key} className="pt-2">
          <DailyBarChart
            data={daily.map((d) => ({ day: d.day, value: d[m.key] }))}
            label={m.label}
            unit={[m.unit[0], m.unit[1]]}
            zoneLabel={zoneLabel}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
