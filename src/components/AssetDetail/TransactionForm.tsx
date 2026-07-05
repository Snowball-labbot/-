import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { AssetItem, TransactionItem } from '@/types';
import { useAssetStore } from '@/store/useAssetStore';
import { getErrorMessage } from '@/lib/api';

interface TransactionFormProps {
  asset: AssetItem;
}

export function TransactionForm({ asset }: TransactionFormProps) {
  const { addTransaction } = useAssetStore();
  const [type, setType] = useState<TransactionItem['type']>('buy');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState(asset.current_price ? String(asset.current_price) : '');
  const [fee, setFee] = useState('0');
  const [exchangeRate, setExchangeRate] = useState(String(asset.exchange_rate_to_cny || 1));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQuantity = parseFloat(quantity || '0');
    const parsedPrice = parseFloat(unitPrice || '0');
    const parsedFee = parseFloat(fee || '0');
    const parsedExchangeRate = parseFloat(exchangeRate || '1');

    if (isNaN(parsedQuantity) || parsedQuantity < 0 || isNaN(parsedPrice) || parsedPrice < 0 || isNaN(parsedExchangeRate) || parsedExchangeRate <= 0) {
      setError('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u4efd\u989d\u3001\u4ef7\u683c\u548c\u6c47\u7387');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await addTransaction(asset.id, {
        type,
        quantity: parsedQuantity,
        unit_price: parsedPrice,
        fee: isNaN(parsedFee) ? 0 : parsedFee,
        currency: asset.currency,
        exchange_rate_to_cny: parsedExchangeRate,
        note: note || undefined,
      });
      setQuantity('');
      setNote('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '\u4fdd\u5b58\u6d41\u6c34\u5931\u8d25'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">{'\u8bb0\u5f55\u4ea4\u6613\u6d41\u6c34'}</h3>
        <span className="text-xs text-gray-500">{asset.currency}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TransactionItem['type'])}
          className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="buy">{'\u4e70\u5165/\u8ffd\u52a0'}</option>
          <option value="sell">{'\u5356\u51fa/\u51cf\u5c11'}</option>
          <option value="adjustment">{'\u4ef7\u683c/\u624b\u52a8\u8c03\u6574'}</option>
        </select>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          step="0.0001"
          min="0"
          placeholder={'\u4efd\u989d/\u80a1\u6570'}
          className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          step="0.0001"
          min="0"
          placeholder={'\u6210\u4ea4/\u6700\u65b0\u5355\u4ef7'}
          className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          step="0.0001"
          min="0"
          placeholder={'\u5151\u4eba\u6c11\u5e01'}
          className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          step="0.01"
          min="0"
          placeholder={'\u8d39\u7528'}
          className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={'\u5907\u6ce8\uff0c\u53ef\u9009'}
          className="h-10 flex-1 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <PlusCircle size={16} />
          {'\u4fdd\u5b58'}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-gray-500">{'\u201c\u4ef7\u683c/\u624b\u52a8\u8c03\u6574\u201d\u53ef\u7528\u4e8e\u8bb0\u5f55\u6700\u65b0\u51c0\u503c\uff0c\u4efd\u989d\u586b 0 \u65f6\u53ea\u66f4\u65b0\u4ef7\u683c\u548c\u4f30\u503c\u5feb\u7167\u3002'}</p>
    </form>
  );
}
