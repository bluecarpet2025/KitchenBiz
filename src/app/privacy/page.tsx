export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="text-neutral-300">
        We only collect the information necessary to operate Kitchen Biz. During the beta, this may include your email and any data you enter into the app. We don’t sell your data. We may contact you about testing and product updates. You can request deletion at any time by emailing <a className="underline" href="mailto:bluecarpetllc@gmail.com">bluecarpetllc@gmail.com</a>.
      </p>
      <p className="text-neutral-300 text-sm">Last updated: {new Date().toLocaleDateString()}</p>
    </main>
  );
}
