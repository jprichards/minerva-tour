import BottomNav from '@/components/navigation/BottomNav';
import { OfflineBanner } from '@/components/OfflineBanner';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-24">
      <OfflineBanner />
      <main className="max-w-lg mx-auto overflow-x-hidden">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
