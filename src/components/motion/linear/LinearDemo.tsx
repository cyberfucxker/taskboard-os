"use client";

import { useState } from "react";
import {
  Collapse,
  CountUp,
  LayoutItem,
  LayoutList,
  PopLayer,
  PressScale,
  Presence,
  SkeletonBlock,
  SkeletonRows,
  SlidingPillTabs,
  StatusChangeFlash,
} from "./index";

/** Demo for the TaskBoard 3 linear/* kit. Staging showcase only. */
const btn =
  "tk-press rounded-md border border-edge bg-raised px-3 py-1 text-xs text-ink hover:bg-hover transition-colors duration-100";
const INITIAL_ROWS = ["TSK-1", "TSK-2", "TSK-3", "TSK-4"];

export function LinearDemo() {
  const [pop, setPop] = useState(false);
  const [col, setCol] = useState(true);
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [n, setN] = useState(1234);
  const [status, setStatus] = useState("Todo");
  const [pres, setPres] = useState(true);
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-8">
      <h2 className="text-base font-semibold text-ink">TaskBoard 3 linear kit</h2>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">PopLayer</h3>
        <div className="relative">
          <button className={btn} onClick={() => setPop((v) => !v)}>
            Toggle popover
          </button>
          <PopLayer
            open={pop}
            className="absolute left-0 top-9 z-10 w-48 rounded-lg border border-edge bg-surface p-2 text-xs text-ink"
          >
            150ms fade + scale 0.98 to 1
          </PopLayer>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Collapse</h3>
        <button className={btn} onClick={() => setCol((v) => !v)}>
          {col ? "Close" : "Open"} group
        </button>
        <Collapse open={col}>
          <div className="space-y-1 pt-2 text-sm text-ink">
            <p>Row one</p>
            <p>Row two</p>
            <p>Row three</p>
          </div>
        </Collapse>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">SlidingPill</h3>
        <SlidingPillTabs
          groupId="demo-tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All" },
            { id: "mine", label: "Mine" },
            { id: "late", label: "Overdue" },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">LayoutList</h3>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => setRows((r) => [...r.slice(1), r[0]])}>
            Move first to bottom
          </button>
          <button className={btn} onClick={() => setRows((r) => r.slice(1))}>
            Remove first
          </button>
          <button className={btn} onClick={() => setRows(INITIAL_ROWS)}>
            Reset
          </button>
        </div>
        <LayoutList className="rounded-lg border border-edge">
          {rows.map((r) => (
            <LayoutItem
              key={r}
              className="flex h-[38px] items-center border-b border-edge px-3 text-sm text-ink last:border-0"
            >
              {r}
            </LayoutItem>
          ))}
        </LayoutList>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">PressScale</h3>
        <PressScale
          as="button"
          className="rounded-md border border-edge bg-raised px-3 py-1 text-xs text-ink"
        >
          Press and hold
        </PressScale>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Presence</h3>
        <button className={btn} onClick={() => setPres((v) => !v)}>
          Toggle
        </button>
        <Presence show={pres}>
          <p className="text-sm text-ink">Fade + 4px rise, exit 100ms</p>
        </Presence>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">Skeleton</h3>
        <button className={btn} onClick={() => setLoading((v) => !v)}>
          {loading ? "Hide" : "Show"} skeleton
        </button>
        {loading && (
          <>
            <SkeletonRows count={3} className="rounded-lg border border-edge" />
            <SkeletonBlock className="h-16 w-full" />
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">CountUp</h3>
        <p className="font-mono text-2xl tabular-nums text-ink">
          <CountUp value={n} />
        </p>
        <button className={btn} onClick={() => setN((v) => v + 137)}>
          Add 137
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">StatusChangeFlash</h3>
        <StatusChangeFlash value={status} className="rounded-lg">
          <div className="flex h-[38px] items-center justify-between rounded-lg border border-edge bg-surface px-3 text-sm text-ink">
            <span>TSK-9 Example row</span>
            <span className="text-muted">{status}</span>
          </div>
        </StatusChangeFlash>
        <button
          className={btn}
          onClick={() =>
            setStatus((s) => (s === "Todo" ? "In progress" : s === "In progress" ? "Done" : "Todo"))
          }
        >
          Change status
        </button>
      </section>
    </div>
  );
}
