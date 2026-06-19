import { getJson } from "./http";

interface Sponsor {
  address: string;
  sponsored: number;
  refunded: number;
  withdrawn: number;
  net: number;
  rank: number;
}

interface SponsorsData {
  top_sponsors: Sponsor[];
}

let cachedSponsors: Map<string, number> | null = null;
let lastFetched = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

export async function fetchSponsoredRewards(address: string): Promise<number> {
  const now = Date.now();
  if (!cachedSponsors || now - lastFetched > CACHE_TTL) {
    try {
      const data = await getJson<SponsorsData>(
        "https://polyrewards.fun/sponsors.json"
      );
      const map = new Map<string, number>();
      if (data && Array.isArray(data.top_sponsors)) {
        for (const item of data.top_sponsors) {
          if (item.address) {
            map.set(item.address.toLowerCase(), Number(item.sponsored) || 0);
          }
        }
      }
      cachedSponsors = map;
      lastFetched = now;
    } catch (err) {
      console.warn("[sponsored] failed to fetch sponsors data", err);
      if (!cachedSponsors) {
        cachedSponsors = new Map();
      }
    }
  }
  return cachedSponsors.get(address.toLowerCase()) || 0;
}

