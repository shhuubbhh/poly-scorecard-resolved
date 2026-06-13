// Import dependencies using relative path
import {
  resolveWallet,
  getProfileByAddress,
  getProfileByUsername,
} from "./src/services/polymarket/profile.ts";

async function runTest() {
  const address = "0x7c024bb95d0dfc5d6fe6eebcd663fce23d047555";
  const username = "@paneerbuttermasala";

  console.log("Testing resolveWallet for address:", address);
  try {
    const profAddr = await resolveWallet(address);
    console.log("Resolved Address Profile:", JSON.stringify(profAddr, null, 2));
  } catch (e) {
    console.error("Failed to resolve address:", e);
  }

  console.log("\nTesting resolveWallet for username:", username);
  try {
    const profUser = await resolveWallet(username);
    console.log("Resolved Username Profile:", JSON.stringify(profUser, null, 2));
  } catch (e) {
    console.error("Failed to resolve username:", e);
  }
}

runTest().catch(console.error);
