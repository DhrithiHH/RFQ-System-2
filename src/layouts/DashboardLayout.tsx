import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ListOrdered, PlusCircle, LogOut, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function DashboardLayout() {
  const { user, demoAccounts, switchDemoAccount, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isBuyer = user?.role === 'BUYER';

  const navItems = isBuyer
    ? [
        { to: '/buyer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/auctions', label: 'Auctions', icon: ListOrdered },
        { to: '/buyer/rfqs/new', label: 'Create RFQ', icon: PlusCircle },
      ]
    : [
        { to: '/supplier/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/auctions', label: 'Invited RFQs', icon: ListOrdered },
      ];

  const breadcrumb = (() => {
    if (location.pathname.startsWith('/buyer/rfqs/new')) return 'Auctions / Create RFQ';
    if (location.pathname.startsWith('/auctions/')) return 'Auctions / Live Auction Room';
    if (location.pathname === '/auctions') return isBuyer ? 'Procurement / All Auctions' : 'Procurement / Invited RFQs';
    return isBuyer ? 'Buyer Workspace / Overview' : 'Supplier Workspace / Overview';
  })();

  const handleSwitchAccount = async (email: string) => {
    const nextUser = await switchDemoAccount(email);
    if (!location.pathname.startsWith('/auctions/')) {
      navigate(nextUser.role === 'BUYER' ? '/buyer/dashboard' : '/supplier/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="h-16 px-6 flex items-center border-b border-slate-200">
            <Link
              to={isBuyer ? '/buyer/dashboard' : '/supplier/dashboard'}
              className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
            >
              GoComet RFQ
            </Link>
          </div>

          <nav className="p-4 space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
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

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {user?.role === 'BUYER' ? 'Buyer' : 'Supplier'} · {user?.email}
            </div>
          </div>

          <div>
            <label
              htmlFor="role-switcher"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Switch Active Account
            </label>
            <select
              id="role-switcher"
              value={user?.email ?? ''}
              onChange={(e) => handleSwitchAccount(e.target.value)}
              className="w-full px-2.5 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            >
              {demoAccounts.map((acc) => (
                <option key={acc.id} value={acc.email}>
                  [{acc.role === 'BUYER' ? 'Buyer' : 'Supplier'}] {acc.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between gap-8">
          <div className="text-sm font-medium text-slate-500 truncate">{breadcrumb}</div>
          <div className="flex items-center gap-3 shrink-0">
            {isBuyer && (
              <Link
                to="/buyer/rfqs/new"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                Create RFQ
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
