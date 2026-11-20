import { useState, type FormEvent } from 'react';
import { formatCurrency } from '../utils/formatters';

interface BidSubmissionFormProps {
  previousTotal: number | null;
  currentLowest: number | null;
  disabled: boolean;
  onSubmit: (payload: {
    carrier_name: string;
    freight_charges: number;
    origin_charges: number;
    destination_charges: number;
    transit_time: number;
    validity_date: string;
  }) => Promise<void>;
}

export default function BidSubmissionForm({
  previousTotal,
  currentLowest,
  disabled,
  onSubmit,
}: BidSubmissionFormProps) {
  const defaultValidity = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [carrierName, setCarrierName] = useState('Maersk Direct');
  const [freight, setFreight] = useState('');
  const [origin, setOrigin] = useState('250');
  const [destination, setDestination] = useState('200');
  const [transitTime, setTransitTime] = useState('20');
  const [validityDate, setValidityDate] = useState(defaultValidity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const computedTotal =
    (Number.parseFloat(freight) || 0) +
    (Number.parseFloat(origin) || 0) +
    (Number.parseFloat(destination) || 0);

  const suggestBeatL1 = () => {
    const baseline =
      currentLowest !== null && previousTotal !== null
        ? Math.min(currentLowest, previousTotal)
        : currentLowest ?? previousTotal ?? 3000;
    const targetTotal = Math.max(500, baseline - 50);
    const originVal = Number.parseFloat(origin) || 0;
    const destVal = Number.parseFloat(destination) || 0;
    const targetFreight = Math.max(0, targetTotal - originVal - destVal);
    setFreight(targetFreight.toFixed(2));
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (previousTotal !== null && computedTotal >= previousTotal) {
      setError(
        `Your new total (${formatCurrency(computedTotal)}) must be strictly lower than your previous bid (${formatCurrency(previousTotal)}).`
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        carrier_name: carrierName.trim(),
        freight_charges: Number(freight),
        origin_charges: Number(origin),
        destination_charges: Number(destination),
        transit_time: Number.parseInt(transitTime, 10),
        validity_date: validityDate,
      });
      setSuccessMsg(`Quotation of ${formatCurrency(computedTotal)} accepted.`);
      setFreight('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quotation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Submit Lower Quotation</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {previousTotal !== null
              ? `Your latest bid is ${formatCurrency(previousTotal)} · Submit a strictly lower total to revise your quote`
              : 'Enter your freight breakdown to enter the live ranking'}
          </p>
        </div>

        <button
          type="button"
          onClick={suggestBeatL1}
          disabled={disabled || submitting}
          className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          Fill $50 Below Current L1
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3.5 py-2.5">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3.5 py-2.5">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Carrier Name</label>
          <input
            required
            disabled={disabled || submitting}
            value={carrierName}
            onChange={(e) => setCarrierName(e.target.value)}
            placeholder="e.g. Maersk MECL"
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
            placeholder="2400.00"
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

      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 text-sm text-slate-600">
          <span>Computed Total:</span>
          <strong className="text-lg font-mono-tabular font-bold text-slate-900">
            {formatCurrency(computedTotal)}
          </strong>
          {previousTotal !== null && freight !== '' && (
            <span
              className={`text-xs font-mono-tabular ${
                computedTotal < previousTotal ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              ({computedTotal < previousTotal ? '-' : '+'}
              {formatCurrency(Math.abs(previousTotal - computedTotal))} vs your last bid)
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled || submitting}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {submitting ? 'Submitting Quote...' : 'Submit Quotation'}
        </button>
      </div>
    </form>
  );
}
