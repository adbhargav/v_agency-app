import { NotificationList } from '../../components/HeaderWidgets';
import { PageHeader } from '../../components/ui';

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" subtitle="Approvals, revisions, deadlines and assignments" />
      <div className="card overflow-hidden">
        <NotificationList />
      </div>
    </div>
  );
}
