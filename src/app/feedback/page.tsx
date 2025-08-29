// src/app/feedback/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import FeedbackForm from "@/components/FeedbackForm";

export default async function FeedbackPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="mt-3">Please <a className="underline" href="/login">log in</a> to leave feedback.</p>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">Feedback</h1>
      <p className="text-neutral-300 mt-2">Tell us anything. We read everything.</p>
      <div className="mt-6">
        <FeedbackForm />
      </div>
    </main>
  );
}
