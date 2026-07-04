import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generalLedgerApi, type LedgerAccount } from '@/lib/api/general-ledger';

const NONE = '__none__';

interface RevenueAccountSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /**
   * Label for the "no explicit account" option — describes what the backend
   * falls back to when nothing is picked (procedure → category → Treatment
   * Revenue). e.g. "Inherit from category" on the procedure form.
   */
  inheritLabel?: string;
  disabled?: boolean;
}

/**
 * Dropdown of active INCOME (revenue) ledger accounts from the chart of
 * accounts. Selecting the first option clears the mapping (sends `null`) so the
 * backend uses its fallback. Used on the Procedure and Procedure-Category forms
 * to route a procedure's revenue to a specific GL account.
 */
export function RevenueAccountSelect({
  value,
  onChange,
  inheritLabel = 'Use default (Treatment Revenue)',
  disabled,
}: RevenueAccountSelectProps) {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    generalLedgerApi
      .listAccounts()
      .then((all) => {
        if (active) {
          setAccounts(all.filter((a) => a.type === 'INCOME' && a.isActive));
        }
      })
      .catch(() => {
        /* non-fatal — the dropdown still offers the fallback option */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={loading ? 'Loading accounts…' : inheritLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{inheritLabel}</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.code} — {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default RevenueAccountSelect;
