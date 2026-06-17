import { getJson } from "./http";

interface SponsoredRewardsData {
  wallet_rewards: {
    address: string;
    rewards: number;
  }[];
}

let cachedRewards: Map<string, number> | null = null;
let lastFetched = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

export async function fetchSponsoredRewards(address: string): Promise<number> {
  const now = Date.now();
  if (!cachedRewards || now - lastFetched > CACHE_TTL) {
    try {
      const data = await getJson<SponsoredRewardsData>(
        "https://polyrewards.fun/sponsored_rewards.json"
      );
      const map = new Map<string, number>();
      if (data && Array.isArray(data.wallet_rewards)) {
        for (const item of data.wallet_rewards) {
          if (item.address) {
            map.set(item.address.toLowerCase(), Number(item.rewards) || 0);
          }
        }
      }
      cachedRewards = map;
      lastFetched = now;
    } catch (err) {
      console.warn("[sponsored] failed to fetch sponsored rewards", err);
      if (!cachedRewards) {
        cachedRewards = new Map();
      }
    }
  }
  return cachedRewards.get(address.toLowerCase()) || 0;
}
