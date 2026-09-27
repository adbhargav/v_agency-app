import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeFor } from '../../lib/roles';
import { EmptyState } from '../../components/ui';

export default function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-lg py-10">
      <EmptyState
        title="Page not found"
        description="The page you were looking for doesn't exist or you don't have access to it."
        action={
          <Link className="btn-primary" to={user ? homeFor(user.role) : '/login'}>
            Go home
          </Link>
        }
      />
    </div>
  );
}
