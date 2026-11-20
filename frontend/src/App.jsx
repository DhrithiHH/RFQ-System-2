import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import AuctionListPage from './pages/AuctionListPage';
import AuctionDetailPage from './pages/AuctionDetailPage';
import CreateRfqPage from './pages/CreateRfqPage';

function HomeRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'BUYER' ? '/buyer/dashboard' : '/supplier/dashboard'} replace />;
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
                  <AuctionListPage />
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
                  <AuctionListPage />
                </ProtectedRoute>
              }
            />
            <Route path="/auctions" element={<AuctionListPage />} />
            <Route path="/auctions/:rfqId" element={<AuctionDetailPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
