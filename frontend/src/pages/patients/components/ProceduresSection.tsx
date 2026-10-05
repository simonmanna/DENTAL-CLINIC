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
          <span className="text-sm font-semibold text-foreground">Procedures</span>
          {procedures.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {procedures.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {procedures.length > 0 && (
            <span className="text-sm font-semibold text-foreground">
              Total: <span className="text-foreground">${total.toLocaleString()}</span>
            </span>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowSearch(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-foreground text-white hover:bg-foreground transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Procedure
            </button>
          )}
        </div>
      </div>

      {/* Add Procedure Panel */}
      {showSearch && !readOnly && (
        <div className="bg-muted/50 rounded-xl border border-border p-4 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Search Procedure Catalog</div>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-border"
              placeholder="Search by name or ADA code (e.g. D2391)…"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedProcedure(null); }}
              autoFocus
            />
          </div>

          {/* Search results */}
          {catalog?.length > 0 && !selectedProcedure && (
            <div className="bg-white border border-border rounded-lg divide-y divide-border/40 max-h-48 overflow-y-auto shadow-sm">
              {catalog.map((proc: any) => (
                <button
                  key={proc.id}
                  onClick={() => { setSelectedProcedure(proc); setSearch(proc.name); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-muted-foreground/70 font-mono mr-2">{proc.adaCode}</span>
                      <span className="text-sm text-foreground">{proc.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">${proc.defaultCost}</span>
                  </div>
                  {proc.category && (
                    <span className="text-xs text-muted-foreground/70 mt-0.5 block">{proc.category}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Selected procedure details */}
          {selectedProcedure && (
            <div className="bg-primary-muted/60 border border-primary/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-primary/70 font-mono mr-2">{selectedProcedure.adaCode}</span>
                  <span className="text-sm font-semibold text-primary">{selectedProcedure.name}</span>
                </div>
                <span className="text-sm font-bold text-primary">${selectedProcedure.defaultCost}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Tooth # (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 14"
                    value={toothNumber}
                    onChange={e => setToothNumber(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Occlusal surface"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-border"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAdd}
                  disabled={addMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-foreground text-white hover:bg-foreground disabled:opacity-50 transition-all"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {addMutation.isPending ? 'Adding…' : 'Add to Visit'}
                </button>
                <button
                  onClick={() => { setSelectedProcedure(null); setSearch(''); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:bg-muted/50 transition-all"
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
        <div className="py-12 text-center rounded-xl border-2 border-dashed border-border/60">
          <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground/70">No procedures recorded</p>
          {!readOnly && (
            <button
              onClick={() => setShowSearch(true)}
              className="mt-2 text-xs text-primary hover:text-primary font-medium"
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
              className="flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-border/60 hover:border-border transition-colors group"
            >
              {/* Icon */}
              <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border/60 flex items-center justify-center flex-shrink-0">
                <Shield className="w-3.5 h-3.5 text-muted-foreground/70" />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {proc.procedure?.adaCode && (
                    <span className="text-[10px] font-bold text-muted-foreground/70 font-mono">{proc.procedure.adaCode}</span>
                  )}
                  <span className="text-sm font-medium text-foreground truncate">
                    {proc.procedure?.name || proc.name || 'Unknown Procedure'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {proc.toothNumber && (
                    <span className="text-xs text-muted-foreground/70">Tooth #{proc.toothNumber}</span>
                  )}
                  {proc.notes && (
                    <span className="text-xs text-muted-foreground/70 truncate">{proc.notes}</span>
                  )}
                </div>
              </div>

              {/* Status */}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                proc.status === 'COMPLETED' ? 'bg-success-muted/60 text-success' :
                proc.status === 'IN_PROGRESS' ? 'bg-primary-muted/60 text-primary' :
                'bg-muted/50 text-muted-foreground'
              }`}>
                {proc.status || 'Planned'}
              </span>

              {/* Cost */}
              <span className="text-sm font-semibold text-foreground flex-shrink-0">
                ${(proc.cost || 0).toLocaleString()}
              </span>

              {/* Remove */}
              {/* {!readOnly && (
                <button
                  onClick={() => removeMutation.mutate(proc.id)}
                  disabled={removeMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground/50 hover:text-danger/70 hover:bg-danger-muted/60 transition-all"
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
        <div className="flex justify-end pt-2 border-t border-border/60">
          <div className="text-right">
            <span className="text-xs text-muted-foreground/70">Procedures Total</span>
            <div className="text-xl font-bold text-foreground">${total.toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
