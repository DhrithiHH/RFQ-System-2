import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, rfqApi } from '../services/api';

export default function CreateRfqPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [form, setForm] = useState({
    name: '',
    reference_id: `RFQ-${now.getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
    origin: '',
    destination: '',
    pickup_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    bid_start_time: toLocalInput(now),
    bid_close_time: toLocalInput(new Date(Date.now() + 30 * 60000)),
    forced_close_time: toLocalInput(new Date(Date.now() + 60 * 60000)),
    trigger_window_minutes: 10,
    extension_duration_minutes: 5,
    bid_received_enabled: true,
    any_rank_change_enabled: false,
    l1_rank_change_enabled: false,
  });

  useEffect(() => {
    authApi.listSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const toggleSupplier = (id) => {
    setSelectedSuppliers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const created = await rfqApi.create({
        name: form.name,
        reference_id: form.reference_id,
        origin: form.origin,
        destination: form.destination,
        pickup_date: form.pickup_date,
        bid_start_time: new Date(form.bid_start_time).toISOString(),
        bid_close_time: new Date(form.bid_close_time).toISOString(),
        forced_close_time: new Date(form.forced_close_time).toISOString(),
        supplier_ids: selectedSuppliers,
        auction_config: {
          trigger_window_minutes: Number(form.trigger_window_minutes),
          extension_duration_minutes: Number(form.extension_duration_minutes),
          bid_received_enabled: form.bid_received_enabled,
          any_rank_change_enabled: form.any_rank_change_enabled,
          l1_rank_change_enabled: form.l1_rank_change_enabled,
        },
      });
      navigate(`/auctions/${created.id}`);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create RFQ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Create British Auction RFQ</h1>
        <p className="text-sm text-slate-500 mt-0.5">Define lane details, deadlines, invited suppliers, and anti-sniping triggers.</p>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {String(error)}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">RFQ Name</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Reference ID</label>
          <input required value={form.reference_id} onChange={(e) => setForm({ ...form, reference_id: e.target.value })} className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Pickup / Service Date</label>
          <input type="date" required value={form.pickup_date} onChange={(e) => setForm({ ...form, pickup_date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Origin</label>
          <input required value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Destination</label>
          <input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Bid Start Time</label>
          <input type="datetime-local" required value={form.bid_start_time} onChange={(e) => setForm({ ...form, bid_start_time: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Bid Close Time</label>
          <input type="datetime-local" required value={form.bid_close_time} onChange={(e) => setForm({ ...form, bid_close_time: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">Forced Bid Close Time</label>
          <input type="datetime-local" required value={form.forced_close_time} onChange={(e) => setForm({ ...form, forced_close_time: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Trigger Window X (minutes)</label>
          <input type="number" min="1" required value={form.trigger_window_minutes} onChange={(e) => setForm({ ...form, trigger_window_minutes: e.target.value })} className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Extension Duration Y (minutes)</label>
          <input type="number" min="1" required value={form.extension_duration_minutes} onChange={(e) => setForm({ ...form, extension_duration_minutes: e.target.value })} className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md" />
        </div>
        <div className="md:col-span-2 space-y-2 pt-2">
          <div className="text-xs font-semibold text-slate-700">Extension Triggers</div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.bid_received_enabled} onChange={(e) => setForm({ ...form, bid_received_enabled: e.target.checked })} />
            Bid received in last X minutes
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.any_rank_change_enabled} onChange={(e) => setForm({ ...form, any_rank_change_enabled: e.target.checked })} />
            Any supplier rank change in last X minutes
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.l1_rank_change_enabled} onChange={(e) => setForm({ ...form, l1_rank_change_enabled: e.target.checked })} />
            Lowest bidder (L1) rank change in last X minutes
          </label>
        </div>
      </div>

      {suppliers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Invite Suppliers</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suppliers.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 text-sm text-slate-700 p-2 rounded border border-slate-100">
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(s.id)}
                  onChange={() => toggleSupplier(s.id)}
                />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50"
        >
          {submitting ? 'Creating RFQ...' : 'Publish British Auction RFQ'}
        </button>
      </div>
    </form>
  );
}
