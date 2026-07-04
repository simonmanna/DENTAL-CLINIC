// src/components/treatment-plans/SessionImagingSection.tsx
//
// Drop this inside your Execute Session modal/dialog.
// It handles BEFORE / AFTER image selection and upload
// tied to the session being executed.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Camera, Upload, X, ZoomIn, Loader2, ImagePlus,
  ScanLine, ImageIcon, ChevronRight, ChevronLeft,
  CheckCircle2, Clock, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Adjust these imports to your project paths ───────────────────────────────
import imagingService from '@/services/imaging.service';
import { ImagingRecord, ImagingType, ImagingStage, ImagingSource } from '@/types/imaging';

// const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";


const resolveUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SessionImageLink {
  imagingRecordId: string;
  stage?: string;
}

interface Props {
  patientId:   string;
  visitId?:    string;
  sessionId:   string;         // ProcedureSession.id
  procedureId: string;         // TreatmentProcedure.id
  planId:      string;
  /** Tooth numbers this session targets (for auto-filling upload form) */
  toothNumbers?: number[];
  /** Called whenever the link list changes so parent can include in executeSession payload */
  onChange?: (links: SessionImageLink[], groupId: string) => void;
  /** Read-only when session is already completed */
  readOnly?: boolean;
}

const IMAGING_TYPE_LABELS: Record<string, string> = {
  PERIAPICAL:      'Periapical X-ray',
  BITEWING:        'Bitewing X-ray',
  PANORAMIC:       'Panoramic X-ray',
  CEPHALOMETRIC:   'Cephalometric',
  CBCT:            'CBCT Scan',
  PHOTO_INTRAORAL: 'Intraoral Photo',
  PHOTO_EXTRAORAL: 'Extraoral Photo',
  OTHER:           'Other',
};

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail
// ─────────────────────────────────────────────────────────────────────────────

const Thumb: React.FC<{
  record: ImagingRecord;
  selected?: boolean;
  onToggle?: () => void;
  onPreview?: () => void;
  onRemove?: () => void;
}> = ({ record, selected, onToggle, onPreview, onRemove }) => {
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);
  const url = resolveUrl(record.thumbnailUrl ?? record.fileUrl);

  return (
    <div
      className={`
        relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer
        ${selected
          ? 'border-sky-500 ring-2 ring-sky-200'
          : 'border-transparent hover:border-sky-300'
        }
      `}
      style={{ aspectRatio: '1' }}
      onClick={onToggle}
    >
      {/* Image */}
      {!error ? (
        <img
          src={url}
          alt={record.fileName}
          className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-gray-400" />
        </div>
      )}

      {!loaded && !error && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}

      {/* Stage badge */}
      <div className="absolute top-1 left-1">
        <span className={`
          text-[10px] font-semibold px-1.5 py-0.5 rounded
          ${record.stage === 'BEFORE' ? 'bg-amber-100 text-amber-700'
          : record.stage === 'AFTER'  ? 'bg-emerald-100 text-emerald-700'
          : 'bg-blue-100 text-blue-700'}
        `}>
          {record.stage ?? '–'}
        </span>
      </div>

      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-1 right-1">
          <CheckCircle2 className="h-4 w-4 text-sky-500 fill-white" />
        </div>
      )}

      {/* Hover actions */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-1">
        <button
          onClick={(e) => { e.stopPropagation(); onPreview?.(); }}
          className="text-white hover:text-sky-300 transition-colors"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-white hover:text-red-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Quick lightbox
// ─────────────────────────────────────────────────────────────────────────────

const Lightbox: React.FC<{
  images: ImagingRecord[];
  index: number;
  onClose: () => void;
}> = ({ images, index, onClose }) => {
  const [cur, setCur] = useState(index);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape')     onClose();
    if (e.key === 'ArrowLeft')  setCur(c => Math.max(0, c - 1));
    if (e.key === 'ArrowRight') setCur(c => Math.min(images.length - 1, c + 1));
  }, [onClose, images.length]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const img = images[cur];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setCur(c => Math.max(0, c - 1)); }}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:text-sky-400"
        disabled={cur === 0}
      >
        <ChevronLeft className="h-8 w-8" />
      </button>
      <img
        src={resolveUrl(img.fileUrl)}
        alt={img.fileName}
        className="max-w-[88vw] max-h-[88vh] object-contain rounded"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={(e) => { e.stopPropagation(); setCur(c => Math.min(images.length - 1, c + 1)); }}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:text-sky-400"
        disabled={cur === images.length - 1}
      >
        <ChevronRight className="h-8 w-8" />
      </button>
      <button onClick={onClose} className="absolute top-4 right-4 text-white hover:text-red-400">
        <X className="h-6 w-6" />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
        {cur + 1} / {images.length} · {img.fileName}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Upload form (sheet-like dialog)
// ─────────────────────────────────────────────────────────────────────────────

const UploadDialog: React.FC<{
  open:        boolean;
  onClose:     () => void;
  defaultStage: string;
  patientId:   string;
  visitId?:    string;
  toothNumbers?: number[];
  onUploaded:  (record: ImagingRecord) => void;
}> = ({ open, onClose, defaultStage, patientId, visitId, toothNumbers, onUploaded }) => {
  const [file,     setFile]     = useState<File | null>(null);
  const [stage,    setStage]    = useState(defaultStage);
  const [type,     setType]     = useState<string>('PERIAPICAL');
  const [notes,    setNotes]    = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) { setFile(null); setStage(defaultStage); setNotes(''); }
  }, [open, defaultStage]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const record = await imagingService.uploadImage(
        file,
        {
          patientId,
          visitId,
          type:        type as ImagingType,
          stage:       stage as ImagingStage,
          toothNumbers: toothNumbers ?? [],
          notes,
          source:      ImagingSource.PROCEDURE,
          takenAt:     new Date().toISOString(),
        },
        () => {},
      );
      toast.success('Image uploaded');
      onUploaded(record);
      onClose();
    } catch {
      toast.error('Upload failed — check file size and type');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="h-5 w-5 text-sky-600" />
            Upload Image
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop area */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            className="
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
              hover:border-sky-400 hover:bg-sky-50 transition-colors
            "
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.dicom,.dcm"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sky-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium truncate max-w-[220px]">{file.name}</span>
              </div>
            ) : (
              <div className="space-y-1 text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto text-sky-400" />
                <p className="text-sm">Drop image here or click to browse</p>
                <p className="text-xs">JPEG, PNG, DICOM — max 50 MB</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BEFORE">Before Treatment</SelectItem>
                  <SelectItem value="AFTER">After Treatment</SelectItem>
                  <SelectItem value="PROGRESS">Progress</SelectItem>
                  <SelectItem value="BASELINE">Baseline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(IMAGING_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {toothNumbers && toothNumbers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Auto-tagged to teeth: {toothNumbers.map(n => `#${n}`).join(', ')}
            </p>
          )}

          <Textarea
            placeholder="Clinical notes (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="text-sm"
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="bg-sky-600 hover:bg-sky-700"
            >
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading…</>
                : <><Upload className="h-4 w-4 mr-2" />Upload</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main: SessionImagingSection
// ─────────────────────────────────────────────────────────────────────────────

export const SessionImagingSection: React.FC<Props> = ({
  patientId,
  visitId,
  sessionId,
  procedureId,
  planId,
  toothNumbers,
  onChange,
  readOnly = false,
}) => {
  // All imaging records fetched from the server for this session
  const [linked,       setLinked]       = useState<ImagingRecord[]>([]);
  // Records available to pick (uploaded for this patient/visit but not yet linked)
  const [available,    setAvailable]    = useState<ImagingRecord[]>([]);
  const [loadingLinked,   setLoadingLinked]   = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(true);

  const [uploadStage,  setUploadStage]  = useState<'BEFORE' | 'AFTER'>('BEFORE');
  const [uploadOpen,   setUploadOpen]   = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxPool, setLightboxPool] = useState<ImagingRecord[]>([]);

  // groupId is stable per session execution — generated once
  const groupIdRef = useRef(`GRP-${procedureId.slice(-6)}-${sessionId.slice(-6)}`);

  // ── Load already-linked images ─────────────────────────────────────────────
  const loadLinked = async () => {
    setLoadingLinked(true);
    try {
      const data = await fetch(
        `/api/treatment-plans/${planId}/procedures/${procedureId}/sessions/${sessionId}/imaging`,
        { credentials: 'include' }
      ).then(r => r.json());
      setLinked(Array.isArray(data) ? data : []);
    } catch {
      // Silently fall back — session may not exist yet (pre-execution)
      setLinked([]);
    } finally {
      setLoadingLinked(false);
    }
  };

  // ── Load available (patient's recent images not yet linked to any session) ─
  const loadAvailable = async () => {
    setLoadingAvailable(true);
    try {
      // This endpoint should return recent ImagingRecords for the patient/visit
      // filtered to those where procedureSessionId is null
      const data = await fetch(
        `/api/imaging/patient/${patientId}?visitId=${visitId ?? ''}&unlinked=true`,
        { credentials: 'include' }
      ).then(r => r.json());
      setAvailable(Array.isArray(data) ? data : []);
    } catch {
      setAvailable([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  useEffect(() => {
    loadLinked();
    loadAvailable();
  }, [sessionId]);

  // ── Notify parent whenever linked list changes ─────────────────────────────
  useEffect(() => {
    const links: SessionImageLink[] = linked.map(r => ({
      imagingRecordId: r.id,
      stage: r.stage ?? undefined,
    }));
    onChange?.(links, groupIdRef.current);
  }, [linked]);

  // ── Link an available image ────────────────────────────────────────────────
  const linkImage = (record: ImagingRecord) => {
    if (linked.find(r => r.id === record.id)) return;
    setLinked(prev => [...prev, record]);
    setAvailable(prev => prev.filter(r => r.id !== record.id));
  };

  // ── Unlink ─────────────────────────────────────────────────────────────────
  const unlinkImage = (record: ImagingRecord) => {
    setLinked(prev => prev.filter(r => r.id !== record.id));
    setAvailable(prev => [record, ...prev]);
  };

  // ── Handle newly uploaded image ────────────────────────────────────────────
  const handleUploaded = (record: ImagingRecord) => {
    // Immediately link it to this session
    setLinked(prev => [...prev, record]);
  };

  // ── Stage buckets ──────────────────────────────────────────────────────────
  const beforeImages  = linked.filter(r => r.stage === 'BEFORE' || r.stage === 'BASELINE');
  const afterImages   = linked.filter(r => r.stage === 'AFTER'  || r.stage === 'PROGRESS');
  const unstagedImages = linked.filter(r => !r.stage || !['BEFORE','AFTER','BASELINE','PROGRESS'].includes(r.stage as string));

  const openLightbox = (pool: ImagingRecord[], idx: number) => {
    setLightboxPool(pool);
    setLightboxIndex(idx);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 rounded-xl border border-sky-100 bg-sky-50/40 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-sky-600" />
          <span className="font-semibold text-sm text-sky-900">X-rays &amp; Photos</span>
          {linked.length > 0 && (
            <Badge variant="secondary" className="text-xs bg-sky-100 text-sky-700">
              {linked.length} linked
            </Badge>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-sky-200 text-sky-700 hover:bg-sky-100"
                    onClick={() => { setUploadStage('BEFORE'); setUploadOpen(true); }}
                  >
                    <Camera className="h-3.5 w-3.5 mr-1" />
                    Before
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload a BEFORE image for this session</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-sky-600 hover:bg-sky-700 text-white"
                    onClick={() => { setUploadStage('AFTER'); setUploadOpen(true); }}
                  >
                    <Camera className="h-3.5 w-3.5 mr-1" />
                    After
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload an AFTER image for this session</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Linked images — BEFORE / AFTER split */}
      {loadingLinked ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading imaging records…
        </div>
      ) : linked.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 text-sky-300" />
          No images linked yet. Upload or select from below.
        </div>
      ) : (
        <div className="space-y-3">
          {beforeImages.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-700 mb-1.5 uppercase tracking-wide">
                Before ({beforeImages.length})
              </p>
              <div className="grid grid-cols-4 gap-2">
                {beforeImages.map((r, i) => (
                  <Thumb
                    key={r.id}
                    record={r}
                    selected
                    onPreview={() => openLightbox(beforeImages, i)}
                    onRemove={readOnly ? undefined : () => unlinkImage(r)}
                  />
                ))}
              </div>
            </div>
          )}

          {afterImages.length > 0 && (
            <div>
              <p className="text-xs font-medium text-emerald-700 mb-1.5 uppercase tracking-wide">
                After ({afterImages.length})
              </p>
              <div className="grid grid-cols-4 gap-2">
                {afterImages.map((r, i) => (
                  <Thumb
                    key={r.id}
                    record={r}
                    selected
                    onPreview={() => openLightbox(afterImages, i)}
                    onRemove={readOnly ? undefined : () => unlinkImage(r)}
                  />
                ))}
              </div>
            </div>
          )}

          {unstagedImages.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Unstaged ({unstagedImages.length})
              </p>
              <div className="grid grid-cols-4 gap-2">
                {unstagedImages.map((r, i) => (
                  <Thumb
                    key={r.id}
                    record={r}
                    selected
                    onPreview={() => openLightbox(unstagedImages, i)}
                    onRemove={readOnly ? undefined : () => unlinkImage(r)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Available unlinked images picker */}
      {!readOnly && (
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-0 flex items-center gap-0.5">
            <Clock className="h-3.5 w-3.5" />
            Recent unlinked images (click to attach)
          </p>
          {loadingAvailable ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          ) : available.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No unlinked images — upload new ones above.
            </p>
          ) : (
            <ScrollArea className="h-28">
              <div className="grid grid-cols-5 gap-1.5 pr-2">
                {available.map((r, i) => (
                  <Thumb
                    key={r.id}
                    record={r}
                    onToggle={() => linkImage(r)}
                    onPreview={() => openLightbox(available, i)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        defaultStage={uploadStage}
        patientId={patientId}
        visitId={visitId}
        toothNumbers={toothNumbers}
        onUploaded={handleUploaded}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxPool.length > 0 && (
        <Lightbox
          images={lightboxPool}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};

export default SessionImagingSection;

// ─────────────────────────────────────────────────────────────────────────────
// USAGE in your Execute Session Dialog:
//
// import { SessionImagingSection } from './SessionImagingSection';
//
// const [imagingLinks, setImagingLinks] = useState<SessionImageLink[]>([]);
// const [imagingGroupId, setImagingGroupId] = useState('');
//
// <SessionImagingSection
//   patientId={visit.patientId}
//   visitId={visit.id}
//   sessionId={session.id}
//   procedureId={procedure.id}
//   planId={plan.id}
//   toothNumbers={procedure.targets.map(t => t.toothNumber).filter(Boolean)}
//   onChange={(links, groupId) => {
//     setImagingLinks(links);
//     setImagingGroupId(groupId);
//   }}
// />
//
// Then in your executeSession payload:
// {
//   ...otherFields,
//   imagingLinks,
//   imagingGroupId,
// }