async function verify() {
  const username = "paneerbuttermasala";
  const address = "0x7c024bb95d0dfc5d6fe6eebcd663fce23d047555";

  console.log("=== VERIFYING DEBUG ENDPOINT FOR USERNAME ===");
  try {
    const res = await fetch(`http://localhost:8080/debug/profile-search?q=${username}`);
    console.log("Status:", res.status);
    if (res.ok) {
      const json = await res.json();
      console.log(JSON.stringify(json, null, 2));
    } else {
      console.log("Failed:", await res.text());
    }
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

verify().catch(console.error);
