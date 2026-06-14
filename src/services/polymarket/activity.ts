import { getJson } from "./http";
import { classify } from "./categories";
import type { Trade } from "./types";

const DATA = "https://data-api.polymarket.com";
const PAGE = 1_000;
// The documented offset schema allows 10,000, but the live Data API currently
// rejects offsets above 3,000. Four 1,000-row pages are therefore the maximum.
const MAX_TRADES = 4_000;

interface RawActivity {
  timestamp?: number; // seconds
  side?: string;
  type?: string;
  usdcSize?: number;
  size?: number;
  price?: number;
  conditionId?: string;
  eventSlug?: string;
  slug?: string;
  title?: string;
  eventTitle?: string;
  outcome?: string;
  pnl?: number;
}

function normalize(r: RawActivity): Trade {
  const usdc =
    typeof r.usdcSize === "number"
      ? r.usdcSize
      : typeof r.size === "number" && typeof r.price === "number"
        ? r.size * r.price
        : 0;
  const slug = r.eventSlug || r.slug;
  const title = r.title || r.eventTitle;
  return {
    timestamp: Number(r.timestamp) || 0,
    usdcSize: Math.max(0, Number(usdc) || 0),
    side: String(r.side || "").toUpperCase(),
    type: String(r.type || "TRADE").toUpperCase(),
    conditionId: String(r.conditionId || ""),
    eventSlug: slug,
    marketTitle: title,
    category: classify(slug, title, r.outcome),
    pnl: typeof r.pnl === "number" ? r.pnl : undefined,
  };
}

/** Fetches the official public activity history, including trades, rewards, redeems, splits, and merges. */
export async function fetchAllActivity(address: string): Promise<Trade[]> {
  const addr = address.toLowerCase();
  const out: Trade[] = [];
  for (let offset = 0; offset < MAX_TRADES; offset += PAGE) {
    const url = `${DATA}/activity?user=${addr}&limit=${PAGE}&offset=${offset}`;
    const page = await getJson<RawActivity[]>(url);
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page.map((item) => normalize(item)));
    if (page.length < PAGE) break;
  }
  return out;
}

export { MAX_TRADES };
