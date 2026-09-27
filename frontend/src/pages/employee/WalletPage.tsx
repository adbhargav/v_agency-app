import { useUser } from '../../context/AuthContext';
import { WalletView } from '../../components/Wallet';
import { PageHeader } from '../../components/ui';

export default function WalletPage() {
  const user = useUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Wallet" subtitle="Earnings credited by your manager for completed work" />
      <WalletView userId={user.id} />
    </div>
  );
}
