import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ allowedRoles, children }) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Verifying session...
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    const fallback = profile.role === 'BUYER' ? '/buyer/dashboard' : '/supplier/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return children;
}
