import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import BuyerDashboardPage from './pages/BuyerDashboardPage';
import SupplierDashboardPage from './pages/SupplierDashboardPage';
import AuctionListPage from './pages/AuctionListPage';
import CreateRfqPage from './pages/CreateRfqPage';
import AuctionDetailPage from './pages/AuctionDetailPage';
import type { UserRole } from './types';
import type { ReactNode } from 'react';

function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles?: UserRole[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading workspace...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to={user.role === 'BUYER' ? '/buyer/dashboard' : '/supplier/dashboard'}
        replace
      />
    );
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'BUYER' ? '/buyer/dashboard' : '/supplier/dashboard'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomeRedirect />} />

          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route
              path="/buyer/dashboard"
              element={
                <ProtectedRoute allowedRoles={['BUYER']}>
                  <BuyerDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/buyer/rfqs/new"
              element={
                <ProtectedRoute allowedRoles={['BUYER']}>
                  <CreateRfqPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/supplier/dashboard"
              element={
                <ProtectedRoute allowedRoles={['SUPPLIER']}>
                  <SupplierDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/auctions" element={<AuctionListPage />} />
            <Route path="/auctions/:rfqId" element={<AuctionDetailPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
