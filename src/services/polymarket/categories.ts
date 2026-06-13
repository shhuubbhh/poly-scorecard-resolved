import type { CategoryName } from "./types";

// Maps Polymarket event/market slugs and tag labels to a coarse category.
// Lower-case substring match; first hit wins.
const RULES: Array<{ test: RegExp; cat: CategoryName }> = [
  {
    test: /(election|trump|biden|harris|congress|senate|president|politic|gop|democrat|republican|vote|ballot)/i,
    cat: "Politics",
  },
  {
    test: /(bitcoin|btc|ethereum|eth|crypto|solana|sol|coin|nft|defi|token|altcoin)/i,
    cat: "Crypto",
  },
  {
    test: /(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|tennis|ufc|mma|f1|formula|champions|world cup|olymp|sport|league)/i,
    cat: "Sports",
  },
  {
    test: /(fed|inflation|cpi|gdp|rate|recession|jobs|unemployment|econ|interest|tariff)/i,
    cat: "Economics",
  },
  {
    test: /(ai\b|gpt|openai|anthropic|llm|tech|chip|nvidia|apple|google|microsoft|tesla|spacex)/i,
    cat: "Technology",
  },
  {
    test: /(war|ukraine|russia|israel|gaza|china|taiwan|nato|iran|nuclear|world|geopolit|climate)/i,
    cat: "World Events",
  },
  {
    test: /(oscar|grammy|movie|film|tv|series|netflix|music|celeb|kardashian|swift|drake|emmy|box office)/i,
    cat: "Pop Culture",
  },
];

export function classify(...hints: Array<string | undefined>): CategoryName {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  if (!text) return "Other";
  for (const r of RULES) if (r.test.test(text)) return r.cat;
  return "Other";
}

export const ALL_CATEGORIES: CategoryName[] = [
  "Politics",
  "Crypto",
  "Sports",
  "Economics",
  "Technology",
  "World Events",
  "Pop Culture",
  "Other",
];
