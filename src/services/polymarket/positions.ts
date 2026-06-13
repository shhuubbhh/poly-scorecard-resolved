import { getJson, NotFoundError } from "./http";
import { classify } from "./categories";
import type { Position } from "./types";

const DATA = "https://data-api.polymarket.com";

interface RawPosition {
  conditionId?: string;
  title?: string;
  eventSlug?: string;
  slug?: string;
  size?: number;
  avgPrice?: number;
  curPrice?: number;
  initialValue?: number;
  currentValue?: number;
  totalBought?: number;
  cashPnl?: number;
  realizedPnl?: number;
  redeemable?: boolean;
  outcome?: string;
}

const normalizePosition = (p: RawPosition): Position => ({
  conditionId: String(p.conditionId || ""),
  marketTitle: p.title,
  eventSlug: p.eventSlug || p.slug,
  size: Number(p.size) || 0,
  avgPrice: Number(p.avgPrice) || 0,
  curPrice: Number(p.curPrice) || 0,
  initialValue: Number(p.initialValue) || 0,
  currentValue: Number(p.currentValue) || 0,
  cashPnl: Number(p.cashPnl) || 0,
  realizedPnl: Number(p.realizedPnl) || 0,
  redeemable: !!p.redeemable,
  category: classify(p.eventSlug || p.slug, p.title, p.outcome),
});

export async function fetchPositions(address: string): Promise<Position[]> {
  const addr = address.toLowerCase();
  try {
    const [current, closed] = await Promise.all([
      getJson<RawPosition[]>(`${DATA}/positions?user=${addr}&limit=500&offset=0&sizeThreshold=0`),
      fetchClosedPositions(addr),
    ]);
    return [
      ...(Array.isArray(current) ? current : []),
      ...closed.map((position) => ({
        ...position,
        size: position.size ?? position.totalBought ?? 0,
      })),
    ].map(normalizePosition);
  } catch (err) {
    if (err instanceof NotFoundError) return [];
    throw err;
  }
}

async function fetchClosedPositions(address: string): Promise<RawPosition[]> {
  const out: RawPosition[] = [];
  const pageSize = 50;
  const maxPositions = 1_000;
  for (let offset = 0; offset < maxPositions; offset += pageSize) {
    const page = await getJson<RawPosition[]>(
      `${DATA}/closed-positions?user=${address}&limit=${pageSize}&offset=${offset}&sortBy=TIMESTAMP&sortDirection=DESC`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

export async function fetchPortfolioValue(address: string): Promise<number> {
  try {
    const data = await getJson<{ value?: number } | Array<{ value?: number }>>(
      `${DATA}/value?user=${address.toLowerCase()}`,
    );
    const v = Array.isArray(data) ? data[0]?.value : data?.value;
    return Number(v) || 0;
  } catch (err) {
    if (err instanceof NotFoundError) return 0;
    throw err;
  }
}

/** Official aggregate count of distinct markets traded (not trading volume). */
export async function fetchTradedMarkets(address: string): Promise<number> {
  try {
    const data = await getJson<{ traded?: number } | Array<{ traded?: number }>>(
      `${DATA}/traded?user=${address.toLowerCase()}`,
    );
    const v = Array.isArray(data) ? data[0]?.traded : data?.traded;
    return Number(v) || 0;
  } catch (err) {
    if (err instanceof NotFoundError) return 0;
    throw err;
  }
}
