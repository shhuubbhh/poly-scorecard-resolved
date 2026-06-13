import { getJson, isAddress, NotFoundError } from "./http";
import type { Profile } from "./types";

const GAMMA = "https://gamma-api.polymarket.com";

interface GammaProfile {
  proxyWallet?: string;
  name?: string;
  pseudonym?: string;
  displayUsernamePublic?: boolean;
  profileImage?: string;
  createdAt?: string;
}

interface SearchResponse {
  profiles?: Array<GammaProfile | null>;
}

function normalizeString(s?: string): string {
  return (s ?? "").trim().toLowerCase();
}

function normalize(raw: GammaProfile, originalAddress?: string): Profile {
  const proxyWallet = (raw.proxyWallet || "").toLowerCase();
  const address = originalAddress ? originalAddress.toLowerCase() : proxyWallet;
  const created = raw.createdAt ? Math.floor(new Date(raw.createdAt).getTime() / 1000) : undefined;
  const publicName = raw.displayUsernamePublic === false ? undefined : raw.name;
  return {
    address,
    proxyWallet: proxyWallet || undefined,
    username: publicName || raw.pseudonym,
    displayUsername: publicName || raw.pseudonym,
    pfpUrl: raw.profileImage,
    createdAt: Number.isFinite(created) ? created : undefined,
  };
}

/** Resolve either a signer/user address or proxy address to the canonical proxy wallet. */
export async function getProfileByAddress(address: string): Promise<Profile> {
  const addr = address.toLowerCase();
  try {
    const raw = await getJson<GammaProfile>(
      `${GAMMA}/public-profile?address=${encodeURIComponent(addr)}`,
    );
    if (raw.proxyWallet) return normalize(raw, addr);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  return { address: addr };
}

/** Look up profile by username (case-insensitive). Returns null if missing. */
export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return null;
  const wanted = normalizeString(u);
  try {
    const data = await getJson<SearchResponse>(
      `${GAMMA}/public-search?q=${encodeURIComponent(u)}&search_profiles=true&limit_per_type=20`,
    );
    const profiles = (data.profiles ?? []).filter(
      (profile): profile is GammaProfile => profile !== null && !!profile.proxyWallet,
    );

    // Create debug output of ALL returned profiles
    const debugOutput = profiles.map((p) => ({
      name: p.name || "",
      pseudonym: p.pseudonym || "",
      proxyWallet: p.proxyWallet || "",
    }));
    console.log(
      "[Identity Search Debug] All returned profiles:",
      JSON.stringify(debugOutput, null, 2),
    );

    // Collect ALL matching profiles (after trim, lowercase, normalization)
    const matchingProfiles = profiles.filter((p) => {
      const nameNorm = normalizeString(p.name);
      const pseudoNorm = normalizeString(p.pseudonym);
      return nameNorm === wanted || pseudoNorm === wanted;
    });

    if (matchingProfiles.length === 0) {
      console.log(`[Identity Search Debug] No profiles matched the query "${u}"`);
      return null;
    }

    if (matchingProfiles.length > 1) {
      console.warn(
        `[Identity Search Debug] WARNING: Multiple profiles matched "${u}":`,
        JSON.stringify(
          matchingProfiles.map((p) => ({
            name: p.name,
            pseudonym: p.pseudonym,
            proxyWallet: p.proxyWallet,
          })),
          null,
          2,
        ),
      );
    } else {
      console.log(
        `[Identity Search Debug] Exactly one profile matched "${u}":`,
        JSON.stringify(matchingProfiles[0], null, 2),
      );
    }

    const raw = matchingProfiles[0];
    if (raw) {
      // Return getProfileByAddress to canonicalize and fetch full details
      const profile = await getProfileByAddress(raw.proxyWallet ?? "");

      // If there were multiple matches, add a warning
      if (matchingProfiles.length > 1) {
        profile.warning = `Multiple Polymarket profiles matched username "${username}". Selected the first match.`;
      }
      return profile;
    }
    return null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

/**
 * Accepts `0x…` address or `@username` / `username` and resolves to a Profile.
 * Throws NotFoundError if a username cannot be resolved.
 */
export async function resolveWallet(input: string): Promise<Profile> {
  const trimmed = input.trim();
  if (!trimmed) throw new NotFoundError("Empty input");

  let profile: Profile;
  let searchResponse: GammaProfile[] | null = null;
  let selectedProfile: Record<string, unknown> | null = null;

  if (isAddress(trimmed)) {
    profile = await getProfileByAddress(trimmed);
  } else {
    // Collect search response for logging
    const u = trimmed.replace(/^@/, "").trim();
    if (u) {
      try {
        const url = `${GAMMA}/public-search?q=${encodeURIComponent(u)}&search_profiles=true&limit_per_type=20`;
        const data = await getJson<SearchResponse>(url);
        searchResponse = (data.profiles ?? []).filter((p): p is GammaProfile => p !== null);
      } catch (err) {
        console.error("[Identity Debug] Search query failed", err);
      }
    }

    const resolvedProfile = await getProfileByUsername(trimmed);
    if (!resolvedProfile?.address) {
      throw new NotFoundError(`No Polymarket user found for "${trimmed}"`);
    }

    profile = resolvedProfile;
    selectedProfile = {
      address: profile.address,
      proxyWallet: profile.proxyWallet,
      username: profile.username,
      displayUsername: profile.displayUsername,
      pfpUrl: profile.pfpUrl,
      createdAt: profile.createdAt,
    };

    // Verify
    const wanted = normalizeString(u);
    const gotName = normalizeString(profile.username);
    const gotPseudo = normalizeString(profile.displayUsername);
    if (gotName !== wanted && gotPseudo !== wanted) {
      profile.warning = "Username and wallet resolution mismatch detected.";
    }
  }

  const proxyWallet = profile.proxyWallet || profile.address;
  const walletUsedForAnalysis = proxyWallet; // Since proxy wallet is always used for analysis

  const debugLog = {
    userInput: trimmed,
    searchResponse,
    selectedProfile,
    proxyWallet,
    walletUsedForAnalysis,
    username: profile.username || "",
    displayUsername: profile.displayUsername || "",
  };

  console.log("[Identity Resolution Flow Log]:", JSON.stringify(debugLog, null, 2));

  // Store debug log on the profile so getWalletAnalysis can fetch it
  profile.debug = debugLog;

  return profile;
}
