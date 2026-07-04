// src/pages/emr/EMRPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { emrApi, staffApi } from '../../lib/api';
import { formatCurrency } from '../../lib/utils';
import { formatDateTime, cn } from '../../lib/utils';
import { PageHeader, Button, Table, Tr, Td, LoadingSpinner, Modal, FormField, Input, Select, Textarea, Pagination } from '../../components/shared';
import { FileText, Plus, Stethoscope, Eye } from 'lucide-react';

export function EMRPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<any>({
    patientId: '', dentistId: '', appointmentId: '',
    subjective: '', objective: '', assessment: '', plan: '',
    bloodPressure: '', pulseRate: '', temperature: '', weight: '', height: '',
    diagnosis: '', findings: '', recommendations: '', followUpDate: '',
  });

  const { data: dentists } = useQuery({ queryKey: ['dentists'], queryFn: staffApi.getDentists });

  const createMutation = useMutation({
    mutationFn: (d: any) => emrApi.create({ ...d, diagnosis: d.diagnosis ? d.diagnosis.split(',').map((x: string) => x.trim()) : [] }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['emr'] });
      setShowCreate(false);
      navigate(`/emr/${result.id}`);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Electronic Medical Records" subtitle="SOAP notes, clinical records and patient histories"
        actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>New EMR Record</Button>} />

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center">
        <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
        <p className="text-slate-600 font-medium">Search by patient or navigate from Patient Detail</p>
        <p className="text-slate-400 text-sm mt-1">Go to a patient profile and select the Medical Records tab to view their EMR history</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/patients')}>Go to Patients</Button>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New EMR / SOAP Record" width="max-w-4xl">
        <form onSubmit={e => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Patient ID" required>
              <Input value={form.patientId} onChange={e => setForm({ ...form, patientId: e.target.value })} placeholder="PAT-00001" required />
            </FormField>
            <FormField label="Dentist" required>
              <Select value={form.dentistId} onChange={e => setForm({ ...form, dentistId: e.target.value })} required>
                <option value="">Select dentist</option>
                {dentists?.map((d: any) => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
              </Select>
            </FormField>
          </div>

          {/* Vitals */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Vitals</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Blood Pressure', key: 'bloodPressure', placeholder: '120/80 mmHg' },
                { label: 'Pulse Rate (bpm)', key: 'pulseRate', placeholder: '72' },
                { label: 'Temperature (°C)', key: 'temperature', placeholder: '36.5' },
                { label: 'Weight (kg)', key: 'weight', placeholder: '70' },
                { label: 'Height (cm)', key: 'height', placeholder: '170' },
                { label: 'SpO2 (%)', key: 'oxygenSat', placeholder: '98' },
              ].map(v => (
                <FormField key={v.key} label={v.label}>
                  <Input value={form[v.key] || ''} onChange={e => setForm({ ...form, [v.key]: e.target.value })} placeholder={v.placeholder} />
                </FormField>
              ))}
            </div>
          </div>

          {/* SOAP */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">SOAP Notes</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'S — Subjective', key: 'subjective', placeholder: "Chief complaint, patient's description of symptoms..." },
                { label: 'O — Objective', key: 'objective', placeholder: 'Clinical findings, examination results, vitals...' },
                { label: 'A — Assessment', key: 'assessment', placeholder: 'Diagnosis, clinical impression...' },
                { label: 'P — Plan', key: 'plan', placeholder: 'Treatment plan, prescriptions, follow-up instructions...' },
              ].map(field => (
                <FormField key={field.key} label={field.label}>
                  <textarea value={form[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                    rows={3} placeholder={field.placeholder}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </FormField>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Diagnosis (comma-separated)">
              <Input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} placeholder="Dental caries, Gingivitis..." />
            </FormField>
            <FormField label="Follow-up Date">
              <Input type="date" value={form.followUpDate} onChange={e => setForm({ ...form, followUpDate: e.target.value })} />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Save EMR Record</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IMAGING PAGE
// ─────────────────────────────────────────────────────────────
export function ImagingPage() {
  const [showUpload, setShowUpload] = useState(false);
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({
    patientId: '', type: 'PERIAPICAL', title: '', fileUrl: '', fileName: '',
    toothNumbers: '', notes: '', findings: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['imaging'],
    queryFn: () => import('../../lib/api').then(m => m.imagingApi.getAll({ limit: 20 })),
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => import('../../lib/api').then(m => m.imagingApi.create({
      ...d, toothNumbers: d.toothNumbers ? d.toothNumbers.split(',').map((n: string) => +n.trim()) : []
    })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['imaging'] }); setShowUpload(false); },
  });

  const IMAGING_TYPES = ['PERIAPICAL', 'BITEWING', 'PANORAMIC', 'CEPHALOMETRIC', 'CBCT', 'PHOTO_INTRAORAL', 'PHOTO_EXTRAORAL', 'OTHER'];
  const records = data?.data || [];

  return (
    <div className="space-y-6">
      <PageHeader title="Imaging & X-Rays" subtitle="Manage dental images, X-rays and scans"
        actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowUpload(true)}>Upload Image</Button>} />

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {records.length === 0 ? (
            <div className="col-span-full py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-500 font-medium">No imaging records</p>
              <Button className="mt-4" onClick={() => setShowUpload(true)}>Upload First Image</Button>
            </div>
          ) : records.map((rec: any) => (
            <div key={rec.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center relative">
                {rec.fileUrl ? (
                  <img src={rec.fileUrl} alt={rec.title} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                ) : null}
                <div className="absolute top-2 left-2">
                  <span className="bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">{rec.type}</span>
                </div>
              </div>
              <div className="p-3">
                <p className="font-semibold text-slate-800 text-sm truncate">{rec.title}</p>
                <p className="text-xs text-slate-500">{rec.patient?.firstName} {rec.patient?.lastName}</p>
                <p className="text-xs text-slate-400 mt-1">{formatDateTime(rec.takenAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Imaging Record">
        <form onSubmit={e => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4">
          <FormField label="Patient ID" required>
            <Input value={form.patientId} onChange={e => setForm({ ...form, patientId: e.target.value })} placeholder="PAT-00001" required />
          </FormField>
          <FormField label="Image Type" required>
            <Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {IMAGING_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </Select>
          </FormField>
          <FormField label="Title" required>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Periapical #16 — Initial" required />
          </FormField>
          <FormField label="File URL" required hint="Paste the URL of the uploaded image">
            <Input value={form.fileUrl} onChange={e => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://..." required />
          </FormField>
          <FormField label="Tooth Numbers" hint="Comma-separated FDI numbers: 16, 17">
            <Input value={form.toothNumbers} onChange={e => setForm({ ...form, toothNumbers: e.target.value })} placeholder="16, 17" />
          </FormField>
          <FormField label="Findings">
            <textarea value={form.findings} onChange={e => setForm({ ...form, findings: e.target.value })} rows={2}
              placeholder="Clinical findings from this image..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </FormField>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Upload</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PHARMACY PAGE
// ─────────────────────────────────────────────────────────────
export function PharmacyPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'drugs' | 'prescriptions'>('drugs');
  const [search, setSearch] = useState('');
  const [showAddDrug, setShowAddDrug] = useState(false);
  const [drugForm, setDrugForm] = useState<any>({ name: '', genericName: '', category: '', form: 'Tablet', strength: '', unit: 'tablet', unitPrice: 0, sellPrice: 0, minStock: 10, requiresPrescription: false });

  const { data: drugs, isLoading: drugsLoading } = useQuery({
    queryKey: ['drugs', search],
    queryFn: () => import('../../lib/api').then(m => m.pharmacyApi.getDrugs({ search })),
  });

  const { data: prescriptions, isLoading: rxLoading } = useQuery({
    queryKey: ['prescriptions'],
    queryFn: () => import('../../lib/api').then(m => m.pharmacyApi.getPrescriptions({ limit: 20 })),
    enabled: activeTab === 'prescriptions',
  });

  const { data: lowStock } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => import('../../lib/api').then(m => m.pharmacyApi.getLowStock()),
  });

  const addDrugMutation = useMutation({
    mutationFn: (d: any) => import('../../lib/api').then(m => m.pharmacyApi.createDrug(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drugs'] }); setShowAddDrug(false); },
  });

  const drugsList = drugs || [];
  const rxList = prescriptions?.data || [];
  // const { formatCurrency } = await import('../../lib/utils').then(m => ({ formatCurrency: m.formatCurrency }));

  return (
    <div className="space-y-6">
      <PageHeader title="Pharmacy" subtitle="Drug inventory, prescriptions and dispensing" />

      {/* Low stock alert */}
      {lowStock?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <p className="text-sm text-amber-800 font-medium">{lowStock.length} drug(s) running low on stock. Restock needed.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['drugs', 'prescriptions'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize',
              activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'drugs' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drugs..."
              className="flex-1 max-w-xs px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddDrug(true)}>Add Drug</Button>
          </div>
          {drugsLoading ? <LoadingSpinner /> : (
            <Table headers={['Drug', 'Category', 'Form/Strength', 'Stock', 'Sell Price', 'Status']}>
              {drugsList.map((drug: any) => (
                <Tr key={drug.id}>
                  <Td>
                    <p className="font-semibold text-slate-800 text-sm">{drug.name}</p>
                    <p className="text-xs text-slate-400">{drug.genericName}</p>
                  </Td>
                  <Td><span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{drug.category}</span></Td>
                  <Td><span className="text-sm text-slate-600">{drug.form} • {drug.strength}</span></Td>
                  <Td>
                    <span className={cn('font-semibold text-sm', drug.stockQuantity <= drug.minStock ? 'text-red-600' : 'text-slate-800')}>
                      {drug.stockQuantity} {drug.unit}s
                    </span>
                    {drug.stockQuantity <= drug.minStock && (
                      <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Low</span>
                    )}
                  </Td>
                  <Td><span className="font-medium text-emerald-700 text-sm">{drug.sellPrice?.toLocaleString()} UGX</span></Td>
                  <Td>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full', drug.requiresPrescription ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>
                      {drug.requiresPrescription ? 'Rx' : 'OTC'}
                    </span>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {activeTab === 'prescriptions' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          {rxLoading ? <LoadingSpinner /> : (
            <Table headers={['Code', 'Patient', 'Dentist', 'Items', 'Status', 'Date']}>
              {rxList.map((rx: any) => (
                <Tr key={rx.id}>
                  <Td><span className="font-mono text-sm text-blue-600">{rx.prescriptionCode}</span></Td>
                  <Td><p className="text-sm font-medium text-slate-800">{rx.patient?.firstName} {rx.patient?.lastName}</p></Td>
                  <Td><p className="text-sm text-slate-600">Dr. {rx.dentist?.firstName} {rx.dentist?.lastName}</p></Td>
                  <Td><span className="text-sm text-slate-600">{rx.items?.length || 0} items</span></Td>
                  <Td><span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', rx.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : rx.status === 'DISPENSED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>{rx.status}</span></Td>
                  <Td><span className="text-xs text-slate-400">{formatDateTime(rx.createdAt)}</span></Td>
                </Tr>
              ))}
            </Table>
          )}
        </div>
      )}

      <Modal open={showAddDrug} onClose={() => setShowAddDrug(false)} title="Add Drug to Formulary">
        <form onSubmit={e => { e.preventDefault(); addDrugMutation.mutate(drugForm); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Drug Name" required><Input value={drugForm.name} onChange={e => setDrugForm({ ...drugForm, name: e.target.value })} required /></FormField>
            <FormField label="Generic Name"><Input value={drugForm.genericName} onChange={e => setDrugForm({ ...drugForm, genericName: e.target.value })} /></FormField>
            <FormField label="Category" required><Input value={drugForm.category} onChange={e => setDrugForm({ ...drugForm, category: e.target.value })} placeholder="Antibiotic, NSAID..." required /></FormField>
            <FormField label="Form"><Select value={drugForm.form} onChange={e => setDrugForm({ ...drugForm, form: e.target.value })}>
              {['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Gel', 'Drops', 'Spray'].map(f => <option key={f}>{f}</option>)}
            </Select></FormField>
            <FormField label="Strength"><Input value={drugForm.strength} onChange={e => setDrugForm({ ...drugForm, strength: e.target.value })} placeholder="500mg, 250mg/5ml..." /></FormField>
            <FormField label="Unit"><Input value={drugForm.unit} onChange={e => setDrugForm({ ...drugForm, unit: e.target.value })} placeholder="tablet, bottle, vial" /></FormField>
            <FormField label="Unit Cost (UGX)"><Input type="number" value={drugForm.unitPrice} onChange={e => setDrugForm({ ...drugForm, unitPrice: +e.target.value })} min={0} /></FormField>
            <FormField label="Sell Price (UGX)"><Input type="number" value={drugForm.sellPrice} onChange={e => setDrugForm({ ...drugForm, sellPrice: +e.target.value })} min={0} /></FormField>
            <FormField label="Min Stock Level"><Input type="number" value={drugForm.minStock} onChange={e => setDrugForm({ ...drugForm, minStock: +e.target.value })} min={0} /></FormField>
            <FormField label="Type">
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={drugForm.requiresPrescription} onChange={e => setDrugForm({ ...drugForm, requiresPrescription: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm">Requires Prescription (Rx)</span>
              </label>
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={() => setShowAddDrug(false)}>Cancel</Button>
            <Button type="submit" loading={addDrugMutation.isPending}>Add Drug</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
