const GAMMA = "https://gamma-api.polymarket.com";

function normalize(raw) {
  const address = (raw.proxyWallet || "").toLowerCase();
  const created = raw.createdAt ? Math.floor(new Date(raw.createdAt).getTime() / 1000) : undefined;
  const publicName = raw.displayUsernamePublic === false ? undefined : raw.name;
  return {
    address,
    username: publicName || raw.pseudonym,
    displayUsername: publicName || raw.pseudonym,
    pfpUrl: raw.profileImage,
    createdAt: Number.isFinite(created) ? created : undefined,
  };
}

async function getProfileByAddress(address) {
  const addr = address.toLowerCase();
  try {
    const res = await fetch(`${GAMMA}/public-profile?address=${encodeURIComponent(addr)}`);
    if (res.status === 404) {
      return { address: addr };
    }
    const raw = await res.json();
    if (raw.proxyWallet) return normalize(raw);
  } catch (err) {
    console.error("Error in getProfileByAddress:", err);
  }
  return { address: addr };
}

async function getProfileByUsername(username) {
  const u = username.replace(/^@/, "").trim();
  if (!u) return null;
  try {
    const res = await fetch(
      `${GAMMA}/public-search?q=${encodeURIComponent(u)}&search_profiles=true&limit_per_type=20`,
    );
    if (res.status === 404) return null;
    const data = await res.json();
    const profiles = (data.profiles ?? []).filter(
      (profile) => profile !== null && !!profile.proxyWallet,
    );
    const wanted = u.toLowerCase();
    const raw = profiles.find(
      (profile) =>
        profile.name?.toLowerCase() === wanted || profile.pseudonym?.toLowerCase() === wanted,
    );
    if (raw) {
      return getProfileByAddress(raw.proxyWallet ?? "");
    }
    return null;
  } catch (err) {
    console.error("Error in getProfileByUsername:", err);
    return null;
  }
}

async function resolveWallet(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const isAddr = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  if (isAddr) return getProfileByAddress(trimmed);
  return getProfileByUsername(trimmed);
}

async function run() {
  const addr = "0x7c024bb95d0dfc5d6fe6eebcd663fce23d047555";
  const user = "@paneerbuttermasala";

  console.log("Resolving address:", addr);
  console.log(await resolveWallet(addr));

  console.log("\nResolving username:", user);
  console.log(await resolveWallet(user));
}

run();
