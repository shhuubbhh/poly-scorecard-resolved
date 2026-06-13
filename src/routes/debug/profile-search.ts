import { createFileRoute } from "@tanstack/react-router";
import { getJson } from "../../services/polymarket/http";
import { getProfileByUsername } from "../../services/polymarket/profile";

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

export const Route = createFileRoute("/debug/profile-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get("q") || "";

        if (!q) {
          return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const u = q.replace(/^@/, "").trim();
          const searchUrl = `${GAMMA}/public-search?q=${encodeURIComponent(u)}&search_profiles=true&limit_per_type=20`;
          const data = await getJson<SearchResponse>(searchUrl);

          const profilesReturned = (data.profiles ?? []).filter(
            (p): p is GammaProfile => p !== null,
          );

          const selectedProfile = await getProfileByUsername(q);
          const walletUsedForAnalysis =
            selectedProfile?.proxyWallet || selectedProfile?.address || null;

          return new Response(
            JSON.stringify({
              input: q,
              profilesReturned,
              selectedProfile,
              walletUsedForAnalysis,
            }),
            {
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }
      },
    },
  },
});
