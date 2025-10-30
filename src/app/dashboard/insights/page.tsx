import "server-only";
import { effectivePlan, canUseFeature } from "@/lib/plan";

export default async function InsightsPage() {
  const plan = await effectivePlan();
  const canUseAI = canUseFeature(plan, "ai_tools");

  if (!canUseAI) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10 text-center">
        <h1 className="text-2xl font-semibold mb-4">Unlock deeper business intelligence</h1>
        <p className="opacity-80 mb-6">
          Upgrade to <strong>Pro</strong> to access AI-generated insights on your sales trends,
          costs, and growth opportunities.
        </p>
        <a
          href="/profile"
          className="inline-block border rounded px-4 py-2 hover:bg-neutral-900"
        >
          Upgrade Now
        </a>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold mb-2">AI Insights</h1>
      <p className="opacity-80">Coming Soon — intelligent reports on your business performance.</p>
    </main>
  );
}
