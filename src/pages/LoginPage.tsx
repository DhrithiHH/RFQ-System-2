import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

export default function LoginPage() {
  const { demoAccounts, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('BUYER');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goDashboard = (userRole: UserRole) => {
    navigate(userRole === 'BUYER' ? '/buyer/dashboard' : '/supplier/dashboard');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user =
        mode === 'login' ? await signIn(email) : await signUp(name, email, role);
      goDashboard(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (accountEmail: string) => {
    setError('');
    setSubmitting(true);
    try {
      const user = await signIn(accountEmail);
      goDashboard(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="bg-white border border-slate-200 rounded-lg p-8">
          <h1 className="text-xl font-bold text-slate-900">GoComet British Auction RFQ</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in with an existing account or register a new Buyer or Supplier profile.
          </p>

          <div className="mt-6 flex gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Register Account
            </button>
          </div>

          {error && (
            <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name / Organization
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. DHL Global Forwarding"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-600"
                  >
                    <option value="BUYER">Buyer — Create RFQs & Manage Auctions</option>
                    <option value="SUPPLIER">Supplier — Quote Invited RFQs</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="buyer@acmelogistics.com"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Profile'}
            </button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-8">
          <h2 className="text-sm font-semibold text-slate-900">Workspace Accounts</h2>
          <p className="text-xs text-slate-500 mt-1">
            Select any seeded Buyer or Supplier account to test live reverse bidding and automatic extensions.
          </p>

          <div className="mt-4 divide-y divide-slate-100 border border-slate-200 rounded-md">
            {demoAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                disabled={submitting}
                onClick={() => handleQuickLogin(acc.email)}
                className="w-full px-4 py-3 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{acc.name}</div>
                  <div className="text-xs text-slate-500 truncate">{acc.email}</div>
                </div>
                <span
                  className={`text-xs font-semibold shrink-0 ${
                    acc.role === 'BUYER' ? 'text-blue-700' : 'text-emerald-700'
                  }`}
                >
                  {acc.role === 'BUYER' ? 'Buyer' : 'Supplier'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
