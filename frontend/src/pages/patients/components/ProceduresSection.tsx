// src/pages/visits/components/ProceduresSection.tsx
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { proceduresApi, visitsApi } from '../../../lib/api';
import { Plus, Trash2, Shield, Search, CheckCircle } from 'lucide-react';

interface ProceduresSectionProps {
  visitId: string;
  procedures: any[];
  readOnly?: boolean;
}

export function ProceduresSection({ visitId, procedures: initialProcedures, readOnly }: ProceduresSectionProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [toothNumber, setToothNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedProcedure, setSelectedProcedure] = useState<any>(null);

  // Search available procedures from catalog
  const { data: catalog } = useQuery({
    queryKey: ['procedures-catalog', search],
    queryFn: () => proceduresApi.search(search),
    enabled: showSearch && search.length >= 2,
  });

  // Fetch live visit procedures
  const { data: visitData } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => visitsApi.getOne(visitId),
    enabled: !!visitId,
  });

  const procedures = visitData?.procedures || initialProcedures || [];

  const addMutation = useMutation({
    mutationFn: (data: { procedureId: string; toothNumber?: string; notes?: string }) =>
      visitsApi.addProcedure(visitId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit', visitId] });
      setSelectedProcedure(null);
      setToothNumber('');
      setNotes('');
      setShowSearch(false);
      setSearch('');
    },
  });

  // const removeMutation = useMutation({
  //   mutationFn: (procedureId: string) => visitsApi.removeProcedure(visitId, procedureId),
  //   onSuccess: () => qc.invalidateQueries({ queryKey: ['visit', visitId] }),
  // });

  const handleAdd = () => {
    if (!selectedProcedure) return;
    addMutation.mutate({
      procedureId: selectedProcedure.id,
      toothNumber: toothNumber || undefined,
      notes: notes || undefined,
    });
  };

  const total = procedures.reduce((sum: number, p: any) => sum + (p.cost || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Procedures</span>
          {procedures.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
              {procedures.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {procedures.length > 0 && (
            <span className="text-sm font-semibold text-slate-700">
              Total: <span className="text-slate-900">${total.toLocaleString()}</span>
            </span>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowSearch(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Procedure
            </button>
          )}
        </div>
      </div>

      {/* Add Procedure Panel */}
      {showSearch && !readOnly && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Search Procedure Catalog</div>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Search by name or ADA code (e.g. D2391)…"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedProcedure(null); }}
              autoFocus
            />
          </div>

          {/* Search results */}
          {catalog?.length > 0 && !selectedProcedure && (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-50 max-h-48 overflow-y-auto shadow-sm">
              {catalog.map((proc: any) => (
                <button
                  key={proc.id}
                  onClick={() => { setSelectedProcedure(proc); setSearch(proc.name); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-400 font-mono mr-2">{proc.adaCode}</span>
                      <span className="text-sm text-slate-700">{proc.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">${proc.defaultCost}</span>
                  </div>
                  {proc.category && (
                    <span className="text-xs text-slate-400 mt-0.5 block">{proc.category}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Selected procedure details */}
          {selectedProcedure && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-blue-400 font-mono mr-2">{selectedProcedure.adaCode}</span>
                  <span className="text-sm font-semibold text-blue-800">{selectedProcedure.name}</span>
                </div>
                <span className="text-sm font-bold text-blue-700">${selectedProcedure.defaultCost}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tooth # (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 14"
                    value={toothNumber}
                    onChange={e => setToothNumber(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Occlusal surface"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAdd}
                  disabled={addMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-all"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {addMutation.isPending ? 'Adding…' : 'Add to Visit'}
                </button>
                <button
                  onClick={() => { setSelectedProcedure(null); setSearch(''); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Procedures list */}
      {procedures.length === 0 ? (
        <div className="py-12 text-center rounded-xl border-2 border-dashed border-slate-100">
          <Shield className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-400">No procedures recorded</p>
          {!readOnly && (
            <button
              onClick={() => setShowSearch(true)}
              className="mt-2 text-xs text-blue-500 hover:text-blue-700 font-medium"
            >
              + Add first procedure
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {procedures.map((proc: any, idx: number) => (
            <div
              key={proc.id || idx}
              className="flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-colors group"
            >
              {/* Icon */}
              <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {proc.procedure?.adaCode && (
                    <span className="text-[10px] font-bold text-slate-400 font-mono">{proc.procedure.adaCode}</span>
                  )}
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {proc.procedure?.name || proc.name || 'Unknown Procedure'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {proc.toothNumber && (
                    <span className="text-xs text-slate-400">Tooth #{proc.toothNumber}</span>
                  )}
                  {proc.notes && (
                    <span className="text-xs text-slate-400 truncate">{proc.notes}</span>
                  )}
                </div>
              </div>

              {/* Status */}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                proc.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' :
                proc.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-600' :
                'bg-slate-50 text-slate-500'
              }`}>
                {proc.status || 'Planned'}
              </span>

              {/* Cost */}
              <span className="text-sm font-semibold text-slate-800 flex-shrink-0">
                ${(proc.cost || 0).toLocaleString()}
              </span>

              {/* Remove */}
              {/* {!readOnly && (
                <button
                  onClick={() => removeMutation.mutate(proc.id)}
                  disabled={removeMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )} */}
            </div>
          ))}
        </div>
      )}

      {/* Total row */}
      {procedures.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <div className="text-right">
            <span className="text-xs text-slate-400">Procedures Total</span>
            <div className="text-xl font-bold text-slate-900">${total.toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
