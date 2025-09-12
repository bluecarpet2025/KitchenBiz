export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Hide the global top nav for all /share/* routes */}
      <style>{`
        [data-kb-topnav] { display: none !important; }
      `}</style>
      {children}
    </>
  );
}
