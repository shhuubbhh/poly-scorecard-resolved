import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { fetchAllSponsors } from "@/services/polymarket/sponsored";
import { performWalletAnalysis } from "@/lib/polymarket.functions";

const CRON_SECRET = process.env.CRON_SECRET || "polyscore_maker_rebates_secret_key_123";

export const Route = createFileRoute("/api/cron/scan-maker-rebates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");

        if (secret !== CRON_SECRET) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Fetch the 34k active sponsors
          const sponsors = await fetchAllSponsors();
          if (!sponsors || sponsors.length === 0) {
            return new Response(JSON.stringify({ message: "No sponsors fetched" }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          // 2. Fetch all existing hashes and updated_at from our DB
          const { data: dbRows, error: dbError } = await supabaseAdmin
            .from("wallet_snapshots")
            .select("wallet_hash, updated_at");

          if (dbError) throw dbError;

          const dbMap = new Map<string, string>(); // hash -> updated_at
          if (dbRows) {
            for (const r of dbRows) {
              dbMap.set(r.wallet_hash, r.updated_at);
            }
          }

          // 3. Map sponsors to hashes and categorize
          const now = Date.now();
          const oneDayAgo = now - 24 * 60 * 60 * 1000;

          const missing: string[] = [];
          const stale: { address: string; updatedAt: number }[] = [];

          for (const sp of sponsors) {
            const addr = sp.address.toLowerCase();
            const hash = crypto.createHash("sha256").update(addr).digest("hex");
            const dbUpdatedAtStr = dbMap.get(hash);

            if (!dbUpdatedAtStr) {
              missing.push(addr);
            } else {
              const dbUpdatedAt = new Date(dbUpdatedAtStr).getTime();
              if (dbUpdatedAt < oneDayAgo) {
                stale.push({ address: addr, updatedAt: dbUpdatedAt });
              }
            }
          }

          // 4. Prioritize missing, then the oldest stale
          stale.sort((a, b) => a.updatedAt - b.updatedAt);
          const toScan = [...missing, ...stale.map((s) => s.address)];

          // 5. Select batch of 30
          const batch = toScan.slice(0, 30);

          if (batch.length === 0) {
            return new Response(JSON.stringify({ message: "All wallets up to date", count: 0 }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          // 6. Process in chunks of 5 with 200ms delay between chunks to avoid rate limiting
          const results: { address: string; status: string; error?: string }[] = [];
          const chunkSize = 5;

          for (let i = 0; i < batch.length; i += chunkSize) {
            const chunk = batch.slice(i, i + chunkSize);
            
            // Run chunk in parallel
            const chunkResults = await Promise.allSettled(
              chunk.map(async (addr) => {
                await performWalletAnalysis(addr);
                return addr;
              })
            );

            for (let j = 0; j < chunkResults.length; j++) {
              const res = chunkResults[j];
              const addr = chunk[j];
              if (res.status === "fulfilled") {
                results.push({ address: addr, status: "success" });
              } else {
                results.push({ address: addr, status: "failed", error: String(res.reason) });
              }
            }

            // Delay if there are more chunks
            if (i + chunkSize < batch.length) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }

          return new Response(
            JSON.stringify({
              message: `Processed ${results.length} wallets`,
              processed: results,
              total_sponsors: sponsors.length,
              db_snapshots: dbMap.size,
              missing_count: missing.length,
              stale_count: stale.length,
            }),
            {
              headers: { "Content-Type": "application/json" },
            }
          );

        } catch (err: any) {
          console.error("[cron] scan-maker-rebates failed:", err);
          return new Response(JSON.stringify({ error: err.message || String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
