export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <ol className="list-decimal pl-5 space-y-2 text-neutral-300">
        <li>Kiori Solutions is provided “as is” during beta. We may change or remove features at any time.</li>
        <li>You are responsible for any data you enter. Back up any critical information.</li>
        <li>By using Kiori Solutions you agree to our Privacy Policy and these Terms.</li>
        <li>Contact: <a className="underline" href="support@kiorisolutions.com">support@kiorisolutions.com</a></li>
      </ol>
      <p className="text-neutral-300 text-sm">Last updated: {new Date().toLocaleDateString()}</p>
    </main>
  );
}
