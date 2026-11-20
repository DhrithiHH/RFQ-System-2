import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ListOrdered, PlusCircle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function DashboardLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const isBuyer = profile?.role === 'BUYER';

  const navItems = isBuyer
    ? [
        { to: '/buyer/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/auctions', label: 'All Auctions', icon: ListOrdered },
        { to: '/buyer/rfqs/new', label: 'Create RFQ', icon: PlusCircle },
      ]
    : [
        { to: '/supplier/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/auctions', label: 'Invited RFQs', icon: ListOrdered },
      ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="h-16 px-6 flex items-center border-b border-slate-200">
            <Link to={isBuyer ? '/buyer/dashboard' : '/supplier/dashboard'} className="text-base font-bold tracking-tight text-slate-900">
              GoComet RFQ
            </Link>
          </div>
          <nav className="p-4 space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200">
          <div className="text-sm font-semibold text-slate-900 truncate">{profile?.name}</div>
          <div className="text-xs text-slate-500 truncate mt-0.5">
            {profile?.role === 'BUYER' ? 'Buyer' : 'Supplier'} · {profile?.email}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between gap-8">
          <div className="text-sm text-slate-500">
            British Auction Procurement Workspace
          </div>
          {isBuyer && (
            <Link
              to="/buyer/rfqs/new"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              Create RFQ
            </Link>
          )}
        </header>
        <main className="flex-1 p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
