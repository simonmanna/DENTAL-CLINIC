// src/pages/visits/components/ProcedureActionMenu.tsx
// Three-dot action menu for procedure cards.
// Fetches eligibility on open, then shows correct affordances:
//   Edit | Cancel | Delete (only if no sessions)
// Used inside ToothDetailDrawer on PLANNED / IN_PROGRESS procedure entries.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MoreVertical, Edit2, Ban, Trash2, Loader2,
  CheckCircle, AlertTriangle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { treatmentProceduresEditApi, ProcedureDeleteEligibility } from '../../../lib/api/treatment-procedures-edit';

interface ProcedureActionMenuProps {
  treatmentPlanId:   string;
  procedureId:       string;
  procedureName:     string;
  procedureStatus:   string;
  onEdit:            () => void;
  onCancel:          () => void;
  onDelete:          (eligibility: ProcedureDeleteEligibility) => void;
}

export function ProcedureActionMenu({
  treatmentPlanId,
  procedureId,
  procedureName,
  procedureStatus,
  onEdit,
  onCancel,
  onDelete,
}: ProcedureActionMenuProps) {
  const [open,      setOpen]      = useState(false);
  const menuRef                   = useRef<HTMLDivElement>(null);

  // Fetch eligibility only when menu is opened
  const { data: eligibility, isLoading } = useQuery({
    queryKey:  ['proc-delete-eligibility', treatmentPlanId, procedureId],
    queryFn:   () => treatmentProceduresEditApi.checkDeleteEligibility(treatmentPlanId, procedureId),
    enabled:   open,
    staleTime: 30_000,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Disable for completed or already-cancelled
  const isCancelled = procedureStatus === 'CANCELLED';
  const isCompleted = procedureStatus === 'COMPLETED';

  const btnStyle = (color: string, disabled?: boolean): React.CSSProperties => ({
    display:        'flex',
    alignItems:     'center',
    gap:            8,
    width:          '100%',
    padding:        '7px 12px',
    fontSize:       11,
    fontWeight:     600,
    color:          disabled ? '#94a3b8' : color,
    background:     'none',
    border:         'none',
    cursor:         disabled ? 'not-allowed' : 'pointer',
    textAlign:      'left',
    borderRadius:   4,
    transition:     'background .1s',
  });

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          width:          26,
          height:         26,
          borderRadius:   5,
          border:         `1px solid ${open ? '#cbd5e1' : '#e2e8f0'}`,
          background:     open ? '#f1f5f9' : '#fff',
          cursor:         'pointer',
          color:          '#64748b',
          transition:     'all .1s',
        }}
        title="Procedure actions"
      >
        <MoreVertical size={13} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:     'absolute',
          right:        0,
          top:          '100%',
          marginTop:    4,
          width:        185,
          background:   '#fff',
          border:       '1px solid #e2e8f0',
          borderRadius: 8,
          boxShadow:    '0 8px 24px rgba(0,0,0,0.13)',
          zIndex:       200,
          overflow:     'hidden',
        }}>

          {/* Loading state */}
          {isLoading && (
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Checking eligibility…</span>
            </div>
          )}

          {!isLoading && eligibility && (
            <>
              {/* Edit */}
              <button
                onClick={() => { setOpen(false); onEdit(); }}
                disabled={isCancelled}
                style={btnStyle('#1d4ed8', isCancelled)}
                onMouseEnter={e => { if (!isCancelled) e.currentTarget.style.background = '#eff6ff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <Edit2 size={12} />
                Edit Procedure
                {isCancelled && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#cbd5e1' }}>Locked</span>}
              </button>

              {/* Sessions indicator */}
              {eligibility.sessionsCount > 0 && (
                <div style={{
                  padding:       '4px 12px',
                  fontSize:       9,
                  color:          '#64748b',
                  background:     '#f8fafc',
                  borderTop:      '1px solid #f1f5f9',
                  borderBottom:   '1px solid #f1f5f9',
                  display:        'flex',
                  alignItems:     'center',
                  gap:            4,
                }}>
                  <AlertTriangle size={9} color="#d97706" />
                  {eligibility.sessionsCount} session{eligibility.sessionsCount !== 1 ? 's' : ''} recorded
                </div>
              )}

              <div style={{ height: 1, background: '#f1f5f9' }} />

              {/* Cancel */}
              <button
                onClick={() => { setOpen(false); onCancel(); }}
                disabled={!eligibility.canCancel}
                style={btnStyle('#d97706', !eligibility.canCancel)}
                onMouseEnter={e => { if (eligibility.canCancel) e.currentTarget.style.background = '#fffbeb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <Ban size={12} />
                Cancel Procedure
                {!eligibility.canCancel && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#cbd5e1' }}>N/A</span>}
              </button>

              <div style={{ height: 1, background: '#f1f5f9' }} />

              {/* Delete */}
              <button
                onClick={() => { setOpen(false); onDelete(eligibility); }}
                disabled={false /* Dialog handles blocked state */}
                style={btnStyle(eligibility.canDelete ? '#dc2626' : '#94a3b8')}
                onMouseEnter={e => { e.currentTarget.style.background = eligibility.canDelete ? '#fff5f5' : '#f8fafc'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <Trash2 size={12} />
                Delete Procedure
                {!eligibility.canDelete && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#cbd5e1' }}>Has sessions</span>
                )}
              </button>
            </>
          )}

          {/* Fallback if eligibility failed */}
          {!isLoading && !eligibility && (
            <div style={{ padding: '10px 14px' }}>
              <p style={{ fontSize: 10, color: '#dc2626', margin: 0 }}>Failed to load eligibility</p>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
