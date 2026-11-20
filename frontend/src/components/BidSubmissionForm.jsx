import { useState } from 'react';
import { formatCurrency } from '../utils/formatters';

export default function BidSubmissionForm({ onSubmit, previousTotal, disabled }) {
  const defaultValidity = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [carrierName, setCarrierName] = useState('');
  const [freight, setFreight] = useState('');
  const [origin, setOrigin] = useState('0');
  const [destination, setDestination] = useState('0');
  const [transitTime, setTransitTime] = useState('14');
  const [validityDate, setValidityDate] = useState(defaultValidity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const computedTotal =
    (parseFloat(freight) || 0) + (parseFloat(origin) || 0) + (parseFloat(destination) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (previousTotal !== null && computedTotal >= Number(previousTotal)) {
      setError(`Your new total must be strictly lower than your previous bid (${formatCurrency(previousTotal)}).`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        carrier_name: carrierName,
        freight_charges: Number(freight).toFixed(2),
        origin_charges: Number(origin).toFixed(2),
        destination_charges: Number(destination).toFixed(2),
        transit_time: parseInt(transitTime, 10),
        validity_date: validityDate,
      });
      setFreight('');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to submit quotation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Submit Lower Quotation</h2>
        {previousTotal !== null && (
          <span className="text-xs text-slate-500">
            Your last bid: <strong className="font-mono-tabular text-slate-900">{formatCurrency(previousTotal)}</strong>
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Carrier Name</label>
          <input
            required
            disabled={disabled || submitting}
            value={carrierName}
            onChange={(e) => setCarrierName(e.target.value)}
            placeholder="e.g., Maersk Line"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Freight Charges (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            disabled={disabled || submitting}
            value={freight}
            onChange={(e) => setFreight(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Origin Charges (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            disabled={disabled || submitting}
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Destination Charges (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            disabled={disabled || submitting}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Transit Time (Days)</label>
          <input
            type="number"
            min="1"
            required
            disabled={disabled || submitting}
            value={transitTime}
            onChange={(e) => setTransitTime(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Quote Validity Date</label>
          <input
            type="date"
            required
            disabled={disabled || submitting}
            value={validityDate}
            onChange={(e) => setValidityDate(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Total Quotation: <strong className="font-mono-tabular text-slate-900">{formatCurrency(computedTotal)}</strong>
        </div>
        <button
          type="submit"
          disabled={disabled || submitting}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting...' : 'Submit Quotation'}
        </button>
      </div>
    </form>
  );
}
