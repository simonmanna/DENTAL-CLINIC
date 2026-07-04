import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BookOpen,
  ListTree,
  Scale,
  TrendingUp,
  Building2,
  Loader2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ChartOfAccountsTab } from './ChartOfAccountsTab';
import { JournalTab } from './JournalTab';
import {
  TrialBalanceTab,
  IncomeStatementTab,
  BalanceSheetTab,
} from './ReportsTabs';
import { GL_HEADER } from './components/theme';
import { generalLedgerApi } from '@/lib/api/general-ledger';

const TAB =
  'data-[state=active]:bg-[#0369a1] data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors';

/** Toggle automatic double-entry posting on/off. Accounting is optional: when
 *  off, expenses/invoices/payments still work but create no journal entries. */
function AutoPostingToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    generalLedgerApi
      .getAutoPosting()
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(true));
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    const prev = enabled;
    setEnabled(next);
    try {
      const r = await generalLedgerApi.setAutoPosting(next);
      setEnabled(r.enabled);
    } catch {
      setEnabled(prev ?? true);
      alert('Failed to update accounting setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ml-auto flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2">
      <div className="text-right">
        <p className="text-sm font-semibold leading-tight">Auto-posting</p>
        <p className="text-[11px] text-sky-100 leading-tight">
          {enabled === null
            ? 'Loading…'
            : enabled
              ? 'Posting journal entries'
              : 'Accounting paused'}
        </p>
      </div>
      {enabled === null || saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Switch checked={enabled} onCheckedChange={toggle} />
      )}
    </div>
  );
}

export default function GeneralLedgerPage() {
  return (
    <div className="min-h-screen bg-slate-50/60">
      {/* Header banner */}
      <div className="px-6 pt-6">
        <div
          className="rounded-xl px-6 py-5 text-white shadow-sm flex items-center gap-4"
          style={{
            background: `linear-gradient(135deg, ${GL_HEADER} 0%, #0c4a6e 100%)`,
          }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">General Ledger</h1>
            <p className="text-sm text-sky-100">
              Double-entry accounting — chart of accounts, journal, and financial
              statements.
            </p>
          </div>
          <AutoPostingToggle />
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="accounts">
          <TabsList className="bg-white border border-slate-200 p-1 h-auto shadow-sm">
            <TabsTrigger value="accounts" className={TAB}>
              <ListTree className="h-4 w-4 mr-1.5" /> Chart of Accounts
            </TabsTrigger>
            <TabsTrigger value="journal" className={TAB}>
              <BookOpen className="h-4 w-4 mr-1.5" /> Journal
            </TabsTrigger>
            <TabsTrigger value="trial-balance" className={TAB}>
              <Scale className="h-4 w-4 mr-1.5" /> Trial Balance
            </TabsTrigger>
            <TabsTrigger value="income" className={TAB}>
              <TrendingUp className="h-4 w-4 mr-1.5" /> Income Statement
            </TabsTrigger>
            <TabsTrigger value="balance-sheet" className={TAB}>
              <Building2 className="h-4 w-4 mr-1.5" /> Balance Sheet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-5">
            <ChartOfAccountsTab />
          </TabsContent>
          <TabsContent value="journal" className="mt-5">
            <JournalTab />
          </TabsContent>
          <TabsContent value="trial-balance" className="mt-5">
            <TrialBalanceTab />
          </TabsContent>
          <TabsContent value="income" className="mt-5">
            <IncomeStatementTab />
          </TabsContent>
          <TabsContent value="balance-sheet" className="mt-5">
            <BalanceSheetTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
