// frontend/src/components/visits/VisitImagingTab.tsx
// Light AdminLTE-style dental imaging viewer — sky blue theme

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, Upload, X, Trash2, Camera,
  Image as ImageIcon, FileImage, ChevronLeft, ChevronRight,
  ExternalLink, AlertTriangle, ScanLine, Layers, GitCompare,
  Plus, Filter, RefreshCw, ZoomIn, ZoomOut,
  ArrowLeftRight, Info, Tag, Clock, Microscope,
} from 'lucide-react';
import imagingService from '@/services/imaging.service';
import { ImagingRecord, ImagingType, ImagingStage, ImagingSource } from '@/types/imaging';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { isValidFdi } from '../../../lib/dental/notation';

// ─── Config ───────────────────────────────────────────────────────────────────
// const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const API_BASE = (import.meta as any).env?.VITE_API_URL ?? '';

const resolveUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface VisitImagingTabProps {
  visitId:   string;
  patientId: string;
  dentistId?: string;
}
type ViewMode    = 'gallery' | 'compare' | 'timeline';
type StageFilter = 'ALL' | 'BEFORE' | 'AFTER' | 'PROGRESS' | 'BASELINE';

interface ImageGroup {
  groupId: string | null;
  before:  ImagingRecord[];
  after:   ImagingRecord[];
  other:   ImagingRecord[];
}

// ─── Label maps ───────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  PERIAPICAL:      'Periapical',
  BITEWING:        'Bitewing',
  PANORAMIC:       'Panoramic',
  CEPHALOMETRIC:   'Cephalometric',
  CBCT:            'CBCT',
  PHOTO_INTRAORAL: 'Intraoral Photo',
  PHOTO_EXTRAORAL: 'Extraoral Photo',
  OTHER:           'Other',
};

// Light-friendly stage config
const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; border: string }> = {
  BEFORE:   { label: 'Before',   bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',   border: 'border-amber-200' },
  AFTER:    { label: 'After',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  PROGRESS: { label: 'Progress', bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-500',     border: 'border-sky-200' },
  BASELINE: { label: 'Baseline', bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500',  border: 'border-violet-200' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Deduplicate records by id to prevent any server-side or strict-mode duplication
const deduplicateById = (records: ImagingRecord[]): ImagingRecord[] =>
  Array.from(new Map(records.map(r => [r.id, r])).values());

const groupImages = (records: ImagingRecord[]): ImageGroup[] => {
  const grouped  = new Map<string, ImageGroup>();
  const ungrouped: ImagingRecord[] = [];

  for (const r of records) {
    if (!r.groupId) { ungrouped.push(r); continue; }
    if (!grouped.has(r.groupId)) {
      grouped.set(r.groupId, { groupId: r.groupId, before: [], after: [], other: [] });
    }
    const g = grouped.get(r.groupId)!;
    if      (r.stage === 'BEFORE' || r.stage === 'BASELINE') g.before.push(r);
    else if (r.stage === 'AFTER'  || r.stage === 'PROGRESS') g.after.push(r);
    else    g.other.push(r);
  }

  const result: ImageGroup[] = [...grouped.values()];
  if (ungrouped.length) result.push({ groupId: null, before: [], after: [], other: ungrouped });
  return result;
};

// ─── StageBadge ───────────────────────────────────────────────────────────────
const StageBadge: React.FC<{ stage: string }> = ({ stage }) => {
  const cfg = STAGE_CONFIG[stage];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ImgThumb
// ═════════════════════════════════════════════════════════════════════════════
const ImgThumb: React.FC<{
  record:    ImagingRecord;
  active?:   boolean;
  onClick?:  () => void;
  onDelete?: () => void;
  showStage?: boolean;
}> = ({ record, active, onClick, onDelete, showStage = true }) => {
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);

  return (
    <div
      onClick={onClick}
      className={`
        relative group overflow-hidden rounded-lg cursor-pointer transition-all duration-200 aspect-square
        ${active
          ? 'ring-2 ring-sky-500 ring-offset-2'
          : 'ring-1 ring-gray-200 hover:ring-sky-300 hover:shadow-md'
        }
        bg-gray-100
      `}
    >
      {!error ? (
        <img
          src={resolveUrl(record.thumbnailUrl ?? record.fileUrl)}
          alt={record.fileName}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-300
            ${loaded ? 'opacity-100' : 'opacity-0'} group-hover:scale-105`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <ImageIcon className="h-5 w-5 text-gray-400" />
        </div>
      )}

      {!loaded && !error && <div className="absolute inset-0 bg-gray-200 animate-pulse" />}

      {showStage && record.stage && STAGE_CONFIG[record.stage] && (
        <div className="absolute top-1.5 left-1.5">
          <StageBadge stage={record.stage} />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-1.5">
        <button
          onClick={e => { e.stopPropagation(); onClick?.(); }}
          className="p-1 rounded bg-white/90 hover:bg-white text-sky-600 transition-colors shadow-sm"
        >
          <ZoomIn className="h-3 w-3" />
        </button>
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded bg-white/90 hover:bg-red-50 text-red-500 transition-colors shadow-sm"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Lightbox
// ═════════════════════════════════════════════════════════════════════════════
const Lightbox: React.FC<{
  records: ImagingRecord[];
  index:   number;
  onClose: () => void;
}> = ({ records, index, onClose }) => {
  const [cur,  setCur]  = useState(index);
  const [zoom, setZoom] = useState(1);
  const [pos,  setPos]  = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos  = useRef({ x: 0, y: 0 });
  const r = records[cur];

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape')     onClose();
    if (e.key === 'ArrowLeft')  setCur(c => Math.max(0, c - 1));
    if (e.key === 'ArrowRight') setCur(c => Math.min(records.length - 1, c + 1));
    if (e.key === '+')          setZoom(z => Math.min(z + 0.25, 4));
    if (e.key === '-')          setZoom(z => Math.max(z - 0.25, 0.5));
  }, [onClose, records.length]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [handleKey]);

  useEffect(() => { setZoom(1); setPos({ x: 0, y: 0 }); }, [cur]);

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3 bg-white/5 border-b border-white/10 backdrop-blur-sm shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {r.stage && <StageBadge stage={r.stage} />}
          <span className="text-sm text-white/90 font-medium truncate max-w-xs">{r.fileName}</span>
          <span className="text-xs text-white/40">{TYPE_LABELS[r.type] ?? r.type}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-white/40 mr-2">{cur + 1}/{records.length}</span>
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-white/50 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 4))} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white">
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-white/15 mx-1" />
          <button onClick={() => window.open(resolveUrl(r.fileUrl), '_blank')} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white">
            <ExternalLink className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => { dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY }; }}
        onMouseMove={e => {
          if (!dragging.current || zoom <= 1) return;
          setPos(p => ({ x: p.x + e.clientX - lastPos.current.x, y: p.y + e.clientY - lastPos.current.y }));
          lastPos.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseUp={() => { dragging.current = false; }}
        style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
      >
        <img
          src={resolveUrl(r.fileUrl)}
          alt={r.fileName}
          className="max-w-full max-h-full object-contain select-none"
          style={{ transform: `scale(${zoom}) translate(${pos.x / zoom}px, ${pos.y / zoom}px)` }}
          draggable={false}
        />
      </div>

      {cur > 0 && (
        <button onClick={e => { e.stopPropagation(); setCur(c => c - 1); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {cur < records.length - 1 && (
        <button onClick={e => { e.stopPropagation(); setCur(c => c + 1); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20">
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Bottom meta */}
      <div
        className="shrink-0 px-5 py-2.5 bg-white/5 border-t border-white/10 flex items-center gap-5 text-xs text-white/40"
        onClick={e => e.stopPropagation()}
      >
        {r.toothNumbers?.length > 0 && (
          <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Teeth: {r.toothNumbers.map((n: number) => `#${n}`).join(', ')}</span>
        )}
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(r.takenAt), 'dd MMM yyyy, HH:mm')}</span>
        {r.fileSize && <span>{(r.fileSize / 1024 / 1024).toFixed(2)} MB</span>}
        {r.notes && <span className="flex items-center gap-1 text-white/50 italic truncate max-w-xs"><Info className="h-3 w-3 shrink-0" />{r.notes}</span>}
        <div className="ml-auto flex gap-1">
          {records.map((rec, i) => (
            <button key={rec.id} onClick={() => setCur(i)}
              className={`h-7 w-10 rounded overflow-hidden border transition-all ${i === cur ? 'border-sky-400 opacity-100' : 'border-white/15 opacity-40 hover:opacity-70'}`}>
              <img src={resolveUrl(rec.thumbnailUrl ?? rec.fileUrl)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ComparePanel — drag divider
// ═════════════════════════════════════════════════════════════════════════════
const ComparePanel: React.FC<{ before: ImagingRecord; after: ImagingRecord }> = ({ before, after }) => {
  const [split, setSplit] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  useEffect(() => {
    const up   = () => { dragging.current = false; };
    const move = (e: MouseEvent)  => handleMove(e.clientX);
    const touch = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', touch);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', touch);
      window.removeEventListener('touchend', up);
    };
  }, [handleMove]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-amber-600 font-medium">
          <span className="h-2 w-2 rounded-full bg-amber-400" />Before · {format(new Date(before.takenAt), 'dd MMM yyyy')}
        </span>
        <span className="text-gray-400 flex items-center gap-1.5">
          <ArrowLeftRight className="h-3 w-3" />Drag to compare
        </span>
        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
          After · {format(new Date(after.takenAt), 'dd MMM yyyy')}
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden border border-gray-200 shadow-inner select-none bg-gray-100"
        style={{ aspectRatio: '16/10', cursor: 'col-resize' }}
        onMouseDown={() => { dragging.current = true; }}
        onTouchStart={() => { dragging.current = true; }}
      >
        <img src={resolveUrl(after.fileUrl)} alt="after" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${split}%` }}>
          <img src={resolveUrl(before.fileUrl)} alt="before"
            className="absolute inset-0 h-full object-cover"
            style={{ width: `${containerRef.current?.clientWidth ?? 800}px`, maxWidth: 'none' }} />
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold shadow">BEFORE</div>
        </div>
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-bold shadow">AFTER</div>
        <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg" style={{ left: `${split}%`, transform: 'translateX(-50%)' }}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center">
            <ArrowLeftRight className="h-3.5 w-3.5 text-gray-600" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// UploadDialog
// ═════════════════════════════════════════════════════════════════════════════
const UploadDialog: React.FC<{
  open:       boolean;
  onClose:    () => void;
  patientId:  string;
  visitId:    string;
  dentistId?: string;
  onUploaded: (r: ImagingRecord) => void;
}> = ({ open, onClose, patientId, visitId, dentistId, onUploaded }) => {
  const [file,      setFile]     = useState<File | null>(null);
  const [preview,   setPreview]  = useState<string | null>(null);
  const [form,      setForm]     = useState({ type: 'PERIAPICAL', stage: 'BEFORE', notes: '', findings: '', takenAt: new Date().toISOString().slice(0, 16), toothNumbers: '' });
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!open) { setFile(null); setPreview(null); setProgress(0); } }, [open]);

  const handleFile = (f: File) => {
    if (f.size > 50 * 1024 * 1024) { toast.error('File too large (max 50 MB)'); return; }
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    }
  };

  const teeth = form.toothNumbers.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && isValidFdi(n));

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const record = await imagingService.uploadImage(file, {
        patientId, visitId, dentistId,
        type:        form.type as ImagingType,
        stage:       form.stage as ImagingStage,
        notes:       form.notes,
        findings:    form.findings,
        takenAt:     form.takenAt,
        toothNumbers: teeth,
        source:      ImagingSource.IMAGING_TAB,
      }, p => setProgress(p));
      toast.success('Image uploaded successfully');
      onUploaded(record);
      onClose();
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-white border-gray-200 text-gray-900 p-0 overflow-hidden shadow-xl">
        <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <DialogTitle className="flex items-center gap-2.5 text-gray-800 text-base font-semibold">
            <div className="h-8 w-8 rounded-lg bg-sky-100 flex items-center justify-center">
              <Camera className="h-4 w-4 text-sky-600" />
            </div>
            Upload Imaging Record
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-0 max-h-[70vh]">
          {/* Drop zone */}
          <div className="border-r border-gray-100 p-5 flex flex-col gap-3 bg-gray-50/50">
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                ${preview ? 'border-transparent' : 'border-gray-300 hover:border-sky-400 hover:bg-sky-50/50'}`}
              style={{ aspectRatio: '4/3' }}
            >
              <input ref={fileRef} type="file" className="hidden" accept="image/*,.dicom,.dcm"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {preview ? (
                <>
                  <img src={preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-sm text-white font-semibold bg-black/40 px-3 py-1.5 rounded-lg">Change file</span>
                  </div>
                  {STAGE_CONFIG[form.stage] && (
                    <div className="absolute top-2 left-2"><StageBadge stage={form.stage} /></div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="h-12 w-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Upload className="h-5 w-5 text-sky-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">Drop image here</p>
                  <p className="text-xs text-gray-400">or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">JPEG · PNG · DICOM · max 50 MB</p>
                </div>
              )}
            </div>

            {file && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <FileImage className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <span className="truncate flex-1 font-medium">{file.name}</span>
                <span className="text-gray-400 shrink-0">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            )}

            {uploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Uploading…</span><span className="font-medium text-sky-600">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5 bg-gray-200 [&>div]:bg-sky-500" />
              </div>
            )}
          </div>

          {/* Metadata */}
          <ScrollArea className="h-[420px]">
            <div className="p-5 space-y-4">
              {/* Stage */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(STAGE_CONFIG).map(([val, cfg]) => (
                    <button
                      key={val}
                      onClick={() => setForm(f => ({ ...f, stage: val }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all
                        ${form.stage === val
                          ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-sm`
                          : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white hover:bg-gray-50'
                        }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${form.stage === val ? cfg.dot : 'bg-gray-300'}`} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Imaging Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-white border-gray-200 text-gray-800 focus:border-sky-400 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v} className="text-gray-700 focus:bg-sky-50 focus:text-sky-700">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Teeth */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tooth Numbers <span className="normal-case text-gray-400 font-normal">(comma-separated)</span>
                </Label>
                <Input
                  placeholder="e.g. 11, 12, 21"
                  value={form.toothNumbers}
                  onChange={e => setForm(f => ({ ...f, toothNumbers: e.target.value }))}
                  className="bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-sky-400 h-9 text-sm"
                />
                {teeth.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {teeth.map(n => (
                      <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">#{n}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Taken</Label>
                <Input
                  type="datetime-local"
                  value={form.takenAt}
                  onChange={e => setForm(f => ({ ...f, takenAt: e.target.value }))}
                  className="bg-white border-gray-200 text-gray-800 focus:border-sky-400 h-9 text-sm"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Clinical Notes</Label>
                <Textarea
                  placeholder="Brief clinical notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-sky-400 text-sm resize-none"
                />
              </div>

              {/* Findings */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Findings</Label>
                <Textarea
                  placeholder="Radiographic findings…"
                  value={form.findings}
                  onChange={e => setForm(f => ({ ...f, findings: e.target.value }))}
                  rows={2}
                  className="bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-sky-400 text-sm resize-none"
                />
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <Button variant="outline" onClick={onClose} disabled={uploading}
            className="border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-800">
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}
            className="bg-sky-600 hover:bg-sky-700 text-white shadow-sm">
            {uploading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading…</>
              : <><Upload className="h-4 w-4 mr-2" />Upload Image</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// StatCard — AdminLTE-style mini stat
// ═════════════════════════════════════════════════════════════════════════════
const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${color} bg-white shadow-sm`}>
    <div className="shrink-0">{icon}</div>
    <div>
      <p className="text-lg font-bold leading-none text-gray-800">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
    </div>
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════════════════
export const VisitImagingTab: React.FC<VisitImagingTabProps> = ({ visitId, patientId, dentistId }) => {
  const [records,      setRecords]      = useState<ImagingRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [viewMode,     setViewMode]     = useState<ViewMode>('gallery');
  const [stageFilter,  setStageFilter]  = useState<StageFilter>('ALL');
  const [typeFilter,   setTypeFilter]   = useState<string>('ALL');
  const [lightbox,     setLightbox]     = useState<{ records: ImagingRecord[]; index: number } | null>(null);
  const [uploadOpen,   setUploadOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [comparePair,  setComparePair]  = useState<{ before: ImagingRecord; after: ImagingRecord } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await imagingService.getImagesByVisitId(visitId);
      // ✅ Deduplicate by ID to prevent double rendering
      setRecords(deduplicateById(data));
    } catch {
      toast.error('Failed to load imaging records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [visitId]);

  useEffect(() => {
    if (viewMode === 'compare' && !comparePair) {
      const groups = groupImages(records);
      for (const g of groups) {
        if (g.before.length > 0 && g.after.length > 0) {
          setComparePair({ before: g.before[0], after: g.after[0] });
          break;
        }
      }
    }
  }, [viewMode, records]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await imagingService.deleteImage(deleteTarget);
      setRecords(prev => prev.filter(r => r.id !== deleteTarget));
      toast.success('Image deleted');
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleUploaded = (r: ImagingRecord) => {
    setRecords(prev => deduplicateById([r, ...prev]));
  };

  const filtered = records.filter(r => {
    const stageOk = stageFilter === 'ALL' || r.stage === stageFilter;
    const typeOk  = typeFilter  === 'ALL' || r.type  === typeFilter;
    return stageOk && typeOk;
  });

  const groups = groupImages(filtered);

  const stats = {
    total:    records.length,
    before:   records.filter(r => r.stage === 'BEFORE'   || r.stage === 'BASELINE').length,
    after:    records.filter(r => r.stage === 'AFTER'    || r.stage === 'PROGRESS').length,
    xray:     records.filter(r => ['PERIAPICAL','BITEWING','PANORAMIC','CEPHALOMETRIC','CBCT'].includes(r.type)).length,
    hasPairs: groupImages(records).some(g => g.before.length > 0 && g.after.length > 0),
  };

  const uniqueTypes = [...new Set(records.map(r => r.type))];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 bg-white rounded-xl border border-gray-200">
        <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
        <p className="text-sm text-gray-500">Loading imaging records…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden  mt-1">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-1 border-b border-gray-100 bg-gradient-to-r from-sky-600 to-sky-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Microscope className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Imaging Records</h3>
            <p className="text-xs text-sky-100">{stats.total} image{stats.total !== 1 ? 's' : ''} · this visit</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode tabs */}
          <div className="flex bg-sky-700/40 rounded-lg p-0.5 gap-0.5 backdrop-blur-sm">
            {([
              { key: 'gallery',  icon: Layers,     label: 'Gallery' },
              { key: 'compare',  icon: GitCompare, label: 'Compare' },
              { key: 'timeline', icon: ScanLine,   label: 'Timeline' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                disabled={key === 'compare' && !stats.hasPairs}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                  ${viewMode === key
                    ? 'bg-white text-sky-700 shadow-sm'
                    : 'text-sky-100 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed'
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>

          <button onClick={load} className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>

          <Button onClick={() => setUploadOpen(true)}
            className="h-8 bg-white text-sky-700 hover:bg-sky-50 text-xs px-3 gap-1.5 font-semibold shadow-sm">
            <Plus className="h-3.5 w-3.5" />Upload
          </Button>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex-wrap">
          <StatCard label="Total" value={stats.total}
            icon={<ImageIcon className="h-4 w-4 text-sky-500" />}
            color="border-sky-100" />
          {stats.before > 0 && (
            <StatCard label="Before" value={stats.before}
              icon={<span className="h-3.5 w-3.5 rounded-full bg-amber-400 block" />}
              color="border-amber-100" />
          )}
          {stats.after > 0 && (
            <StatCard label="After" value={stats.after}
              icon={<span className="h-3.5 w-3.5 rounded-full bg-emerald-500 block" />}
              color="border-emerald-100" />
          )}
          {stats.xray > 0 && (
            <StatCard label="X-Rays" value={stats.xray}
              icon={<ScanLine className="h-4 w-4 text-violet-500" />}
              color="border-violet-100" />
          )}
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      {records.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-white flex-wrap">
          <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" />

          <div className="flex gap-1 flex-wrap">
            {(['ALL', 'BEFORE', 'AFTER', 'PROGRESS', 'BASELINE'] as StageFilter[]).map(s => {
              const cfg = s !== 'ALL' ? STAGE_CONFIG[s] : null;
              const isActive = stageFilter === s;
              return (
                <button key={s} onClick={() => setStageFilter(s)}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-medium border transition-all
                    ${isActive
                      ? cfg ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'bg-gray-100 text-gray-700 border-gray-300'
                      : 'text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                    }`}
                >
                  {s === 'ALL' ? 'All stages' : cfg!.label}
                </button>
              );
            })}
          </div>

          {uniqueTypes.length > 1 && (
            <>
              <div className="h-4 w-px bg-gray-200 mx-1" />
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setTypeFilter('ALL')}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                    typeFilter === 'ALL' ? 'bg-gray-100 text-gray-700 border-gray-300' : 'text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                  All types
                </button>
                {uniqueTypes.map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                      typeFilter === t ? 'bg-sky-50 text-sky-700 border-sky-200' : 'text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                    {TYPE_LABELS[t] ?? t}
                  </button>
                ))}
              </div>
            </>
          )}

          <span className="ml-auto text-xs text-gray-400 font-medium">
            {filtered.length !== records.length ? `${filtered.length} of ${records.length}` : `${records.length} total`}
          </span>
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">

        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-20 w-20 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center">
              <ScanLine className="h-9 w-9 text-sky-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-gray-600 font-semibold">No imaging records yet</p>
              <p className="text-sm text-gray-400">Upload X-rays and photos to track treatment progress</p>
            </div>
            <Button onClick={() => setUploadOpen(true)} className="bg-sky-600 hover:bg-sky-700 text-white gap-2 shadow-sm">
              <Camera className="h-4 w-4" />Upload first image
            </Button>
          </div>

        ) : viewMode === 'gallery' ? (
          // ── Gallery ──────────────────────────────────────────────────────
          <div className="p-5 space-y-6">
            {groups.map((group, gi) => {
              const allInGroup  = [...group.before, ...group.after, ...group.other];
              const hasBothSides = group.before.length > 0 && group.after.length > 0;

              return (
                <div key={group.groupId ?? `ug-${gi}`} className="space-y-3">
                  {/* Group header */}
                  {group.groupId && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-px w-6 bg-gray-200" />
                        <span className="text-[11px] text-gray-400 font-mono uppercase tracking-widest">
                          Group · {group.groupId.slice(-8)}
                        </span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      {hasBothSides && (
                        <button
                          onClick={() => { setComparePair({ before: group.before[0], after: group.after[0] }); setViewMode('compare'); }}
                          className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 font-medium transition-colors"
                        >
                          <GitCompare className="h-3.5 w-3.5" />Compare before/after
                        </button>
                      )}
                    </div>
                  )}

                  {hasBothSides ? (
                    // Split before/after layout
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-amber-400" />
                          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Before ({group.before.length})</p>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {group.before.map((r, i) => (
                            <ImgThumb key={r.id} record={r} showStage={false}
                              onClick={() => setLightbox({ records: group.before, index: i })}
                              onDelete={() => setDeleteTarget(r.id)} />
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">After ({group.after.length})</p>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {group.after.map((r, i) => (
                            <ImgThumb key={r.id} record={r} showStage={false}
                              onClick={() => setLightbox({ records: group.after, index: i })}
                              onDelete={() => setDeleteTarget(r.id)} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Standard grid
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-1.5">
                      {allInGroup.map((r, i) => (
                        <ImgThumb key={r.id} record={r}
                          onClick={() => setLightbox({ records: allInGroup, index: i })}
                          onDelete={() => setDeleteTarget(r.id)} />
                      ))}
                    </div>
                  )}

                  {/* Other/unstaged */}
                  {group.other.length > 0 && hasBothSides && (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 pt-1">
                      {group.other.map((r, i) => (
                        <ImgThumb key={r.id} record={r}
                          onClick={() => setLightbox({ records: group.other, index: i })}
                          onDelete={() => setDeleteTarget(r.id)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        ) : viewMode === 'compare' ? (
          // ── Compare ──────────────────────────────────────────────────────
          <div className="p-5 space-y-5">
            {comparePair ? (
              <>
                <ComparePanel before={comparePair.before} after={comparePair.after} />
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Available pairs</p>
                  <div className="flex flex-wrap gap-2">
                    {groupImages(records)
                      .filter(g => g.before.length > 0 && g.after.length > 0)
                      .map((g, gi) => (
                        <button key={g.groupId ?? gi}
                          onClick={() => setComparePair({ before: g.before[0], after: g.after[0] })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all font-medium
                            ${comparePair.before.id === g.before[0].id
                              ? 'bg-sky-50 border-sky-300 text-sky-700 shadow-sm'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-sky-200 hover:bg-sky-50/40'
                            }`}>
                          <div className="flex gap-1">
                            <div className="h-7 w-10 rounded overflow-hidden border border-amber-200">
                              <img src={resolveUrl(g.before[0].thumbnailUrl ?? g.before[0].fileUrl)} alt="" className="h-full w-full object-cover" />
                            </div>
                            <div className="h-7 w-10 rounded overflow-hidden border border-emerald-200">
                              <img src={resolveUrl(g.after[0].thumbnailUrl ?? g.after[0].fileUrl)} alt="" className="h-full w-full object-cover" />
                            </div>
                          </div>
                          {g.groupId ? `Group ${g.groupId.slice(-6)}` : `Pair ${gi + 1}`}
                        </button>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <GitCompare className="h-10 w-10 text-gray-300" />
                <p className="text-gray-500 font-medium text-sm">No before/after pairs found</p>
                <p className="text-xs text-gray-400 text-center max-w-xs">
                  Upload images with matching BEFORE and AFTER stages in the same group to enable comparison.
                </p>
              </div>
            )}
          </div>

        ) : (
          // ── Timeline ─────────────────────────────────────────────────────
          <div className="p-5">
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[116px] top-3 bottom-3 w-px bg-gray-200" />

              <div className="space-y-1">
                {filtered.slice().sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime())
                  .map((r, i) => (
                    <div key={r.id} className="flex gap-4 items-start group">
                      {/* Date */}
                      <div className="w-[108px] shrink-0 text-right pt-2.5">
                        <p className="text-xs text-gray-600 font-semibold">{format(new Date(r.takenAt), 'dd MMM')}</p>
                        <p className="text-[10px] text-gray-400">{format(new Date(r.takenAt), 'HH:mm')}</p>
                      </div>

                      {/* Dot */}
                      <div className="shrink-0 relative z-10 mt-3">
                        <div className={`h-3 w-3 rounded-full border-2 border-white shadow-sm ${
                          r.stage ? STAGE_CONFIG[r.stage]?.dot ?? 'bg-gray-300' : 'bg-gray-300'
                        }`} />
                      </div>

                      {/* Card */}
                      <div
                        onClick={() => setLightbox({ records: filtered, index: i })}
                        className="flex-1 flex items-start gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-sky-200 hover:shadow-sm cursor-pointer transition-all mb-2"
                      >
                        <div className="h-14 w-20 rounded-lg overflow-hidden shrink-0 border border-gray-200 bg-gray-50">
                          <img src={resolveUrl(r.thumbnailUrl ?? r.fileUrl)} alt={r.fileName} loading="lazy" className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-gray-700">{TYPE_LABELS[r.type] ?? r.type}</span>
                            {r.stage && <StageBadge stage={r.stage} />}
                            {r.toothNumbers?.length > 0 && (
                              <span className="text-[10px] text-gray-400">
                                Teeth {r.toothNumbers.map((n: number) => `#${n}`).join(', ')}
                              </span>
                            )}
                          </div>
                          {r.notes && <p className="text-xs text-gray-500 truncate">{r.notes}</p>}
                          {r.findings && <p className="text-xs text-gray-400 italic truncate">{r.findings}</p>}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget(r.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Lightbox ───────────────────────────────────────────────────────── */}
      {lightbox && (
        <Lightbox records={lightbox.records} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      {/* ── Upload ─────────────────────────────────────────────────────────── */}
      <UploadDialog
        open={uploadOpen} onClose={() => setUploadOpen(false)}
        patientId={patientId} visitId={visitId} dentistId={dentistId}
        onUploaded={handleUploaded}
      />

      {/* ── Delete confirm ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white border-gray-200 text-gray-900 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-800">
              <div className="h-8 w-8 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              Delete Image
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              This imaging record will be permanently deleted and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VisitImagingTab;