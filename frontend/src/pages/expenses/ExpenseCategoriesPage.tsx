// src/pages/expenses/ExpenseCategoriesPage.tsx
//
// Manage the dynamic expense-category list: create, edit, disable, delete, and
// (optionally) link each category to a GL ledger account. A category with a GL
// link posts double-entry; one without records the expense but no journal entry.

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  Plus,
  Edit3,
  Trash2,
  ChevronLeft,
  Link2,
  Link2Off,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  expenseCategoriesApi,
  type ExpenseCategory,
} from "@/lib/api/expenseCategories";
import { generalLedgerApi, type LedgerAccount } from "@/lib/api/general-ledger";

const NONE = "__none__";

function CategoryDialog({
  category,
  expenseAccounts,
  onClose,
  onSaved,
}: {
  category?: ExpenseCategory | null;
  expenseAccounts: LedgerAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [ledgerAccountId, setLedgerAccountId] = useState(
    category?.ledgerAccountId ?? NONE,
  );
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return setError("Category name is required");
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon.trim() || undefined,
        ledgerAccountId: ledgerAccountId === NONE ? null : ledgerAccountId,
      };
      if (isEdit) {
        await expenseCategoriesApi.update(category!.id, {
          ...payload,
          isActive,
        });
      } else {
        await expenseCategoriesApi.create(payload);
      }
      onSaved();
    } catch (e: any) {
      const msg = e.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(", ") : msg || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit "${category?.name}"` : "New Expense Category"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">
                Icon
              </label>
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🦷"
                maxLength={4}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lab Materials"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">
              Linked GL Account (optional)
            </label>
            <Select value={ledgerAccountId} onValueChange={setLedgerAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="No GL account — won't post" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  No GL account — records expense, no journal entry
                </SelectItem>
                {expenseAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500 mt-1">
              Link an account to post double-entry (DR this account · CR Cash/AP).
              Leave unset to keep this category out of the ledger.
            </p>
          </div>

          {isEdit && (
            <div className="flex items-center justify-between rounded border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-[11px] text-slate-500">
                  Disabled categories are hidden from new expenses but keep their
                  history.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{
    open: boolean;
    category?: ExpenseCategory | null;
  }>({ open: false });

  const expenseAccounts = accounts.filter(
    (a) => a.type === "EXPENSE" && a.isActive,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, accs] = await Promise.all([
        expenseCategoriesApi.list(true), // include inactive for management
        generalLedgerApi.listAccounts().catch(() => [] as LedgerAccount[]),
      ]);
      setCategories(cats);
      setAccounts(accs);
    } catch (e) {
      console.error("Failed to load categories:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (cat: ExpenseCategory) => {
    if (!confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;
    try {
      await expenseCategoriesApi.remove(cat.id);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const toggleActive = async (cat: ExpenseCategory) => {
    try {
      await expenseCategoriesApi.update(cat.id, { isActive: !cat.isActive });
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || e.message);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/expenses"
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Expenses
          </Link>
          <h1 className="text-xl font-bold text-slate-800 mt-1">
            Expense Categories
          </h1>
          <p className="text-sm text-slate-500">
            Manage categories and their optional accounting links.
          </p>
        </div>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus className="w-4 h-4 mr-1" /> New Category
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Category</th>
                <th className="text-left px-4 py-2 font-semibold">GL Account</th>
                <th className="text-center px-4 py-2 font-semibold">Uses</th>
                <th className="text-center px-4 py-2 font-semibold">Status</th>
                <th className="text-right px-4 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.id} className={c.isActive ? "" : "bg-slate-50/60"}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-800">
                      {c.icon ? `${c.icon} ` : ""}
                      {c.name}
                    </span>
                    {c.isSystem && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                        default
                      </span>
                    )}
                    {c.description && (
                      <p className="text-xs text-slate-400">{c.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.ledgerAccount ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Link2 className="w-3.5 h-3.5" />
                        {c.ledgerAccount.code} · {c.ledgerAccount.name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Link2Off className="w-3.5 h-3.5" /> Not posted
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-500">
                    {c._count?.expenses ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => toggleActive(c)}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        c.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {c.isActive ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setDialog({ open: true, category: c })}
                      className="p-1.5 text-slate-500 hover:text-[#3c8dbc]"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(c)}
                      disabled={c.isSystem || (c._count?.expenses ?? 0) > 0}
                      className="p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        c.isSystem
                          ? "Default category — disable instead"
                          : (c._count?.expenses ?? 0) > 0
                            ? "In use — disable instead"
                            : "Delete"
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {dialog.open && (
        <CategoryDialog
          category={dialog.category}
          expenseAccounts={expenseAccounts}
          onClose={() => setDialog({ open: false })}
          onSaved={() => {
            setDialog({ open: false });
            load();
          }}
        />
      )}
    </div>
  );
}
