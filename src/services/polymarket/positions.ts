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

export interface LeaderboardStats {
  vol: number;
  pnl: number;
  rank?: string;
}

/** Official aggregate lifetime volume and PNL from Polymarket's leaderboard. */
export async function fetchLeaderboardStats(address: string): Promise<LeaderboardStats | null> {
  try {
    const data = await getJson<Array<{ vol: number; pnl: number; rank?: string }>>(
      `https://data-api.polymarket.com/v1/leaderboard?user=${address.toLowerCase()}&timePeriod=ALL`
    );
    if (Array.isArray(data) && data.length > 0) {
      return {
        vol: Number(data[0].vol) || 0,
        pnl: Number(data[0].pnl) || 0,
        rank: data[0].rank,
      };
    }
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
  return null;
}

/** Fetches native USDC and USDC.e balances on Polygon for the address. */
export async function fetchOnChainCashBalance(address: string): Promise<number> {
  const usdce = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
  const usdcNative = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
  const rpcUrls = [
    "https://rpc.ankr.com/polygon",
    "https://1rpc.io/matic",
    "https://polygon-mainnet.public.blastapi.io",
    "https://polygon.llamarpc.com"
  ];

  const cleanAddress = address.toLowerCase().replace("0x", "");
  const paddedAddress = cleanAddress.padStart(64, "0");
  const callData = "0x70a08231" + paddedAddress;

  const getBalanceForToken = async (rpcUrl: string, token: string): Promise<number> => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: token, data: callData }, "latest"]
      })
    });
    if (!res.ok) throw new Error("RPC request failed");
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    const balanceBI = BigInt(json.result || "0x0");
    return Number(balanceBI) / 1e6;
  };

  for (const rpcUrl of rpcUrls) {
    try {
      const [usdceBal, nativeBal] = await Promise.all([
        getBalanceForToken(rpcUrl, usdce),
        getBalanceForToken(rpcUrl, usdcNative)
      ]);
      return usdceBal + nativeBal;
    } catch (err) {
      console.warn(`[polyscore] RPC balance check failed on ${rpcUrl}:`, err);
    }
  }
  return 0; // Fallback to 0 if all RPCs fail
}

