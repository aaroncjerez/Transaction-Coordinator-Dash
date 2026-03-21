import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle, XCircle, SkipForward, Trash2, ChevronDown, ChevronRight, Package, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { uploadDialerLeads, onDialerUploadProgress, fetchDialerUploadBatches, fetchDialerUploadBatchLeads, deleteDialerUploadBatch } from '../../lib/database';
import { formatPhone } from '../../lib/utils/phone';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';
import type { UploadBatchResult, UploadLeadRow } from '../../types';

// ── Column alias mapping ──
const FIELD_ALIASES: Record<string, string> = {
  // phone
  'phone': 'phone_number', 'phone number': 'phone_number', 'phone_number': 'phone_number',
  'phonenumber': 'phone_number', 'mobile': 'phone_number', 'cell': 'phone_number',
  'telephone': 'phone_number', 'tel': 'phone_number', 'cell phone': 'phone_number',
  'primary phone': 'phone_number', 'preferred phone': 'phone_number',
  'phone number (data)': 'phone_number', 'e164phone': 'phone_number',
  // name
  'first name': 'first_name', 'first_name': 'first_name', 'firstname': 'first_name',
  'fname': 'first_name', 'first': 'first_name',
  'last name': 'last_name', 'last_name': 'last_name', 'lastname': 'last_name',
  'lname': 'last_name', 'last': 'last_name', 'surname': 'last_name',
  // contact
  'email': 'email', 'email address': 'email', 'emailaddress': 'email',
  // location
  'county': 'county', 'state': 'state', 'st': 'state',
  // property
  'parcel acres': 'parcel_acres', 'parcel_acres': 'parcel_acres', 'acres': 'parcel_acres',
  'acreage': 'parcel_acres', 'lot acres': 'parcel_acres', 'lot_acreage': 'parcel_acres',
  'property address': 'property_address', 'property_address': 'property_address',
  'address': 'property_address', 'street address': 'property_address',
  'property city': 'property_city', 'property_city': 'property_city', 'city': 'property_city',
  'property zip': 'property_zip', 'property_zip': 'property_zip', 'zip': 'property_zip',
  'zipcode': 'property_zip', 'zip code': 'property_zip',
  'parcel number': 'parcel_number', 'parcel_number': 'parcel_number', 'apn': 'parcel_number',
  'parcel id': 'parcel_number', 'parcel': 'parcel_number',
  // financial
  'market value': 'market_value', 'market_value': 'market_value', 'value': 'market_value',
  'estimated value': 'market_value', 'assessed value': 'market_value',
  'min offer': 'min_offer', 'min_offer': 'min_offer', 'minimum offer': 'min_offer',
  'max offer': 'max_offer', 'max_offer': 'max_offer', 'maximum offer': 'max_offer',
  // meta
  'labels': 'labels', 'tags': 'labels', 'label': 'labels',
  'notes': 'notes', 'note': 'notes', 'comments': 'notes',
  'lead source': 'lead_source', 'lead_source': 'lead_source', 'source': 'lead_source',
  'acquired by': 'acquired_by', 'acquired_by': 'acquired_by', 'agent': 'acquired_by',
};

const TARGET_FIELDS: { value: string; label: string; group: string }[] = [
  { value: '', label: '— Skip —', group: '' },
  // Contact
  { value: 'phone_number', label: 'Phone Number *', group: 'Contact' },
  { value: 'first_name', label: 'First Name', group: 'Contact' },
  { value: 'last_name', label: 'Last Name', group: 'Contact' },
  { value: 'email', label: 'Email', group: 'Contact' },
  // Property
  { value: 'county', label: 'County', group: 'Property' },
  { value: 'state', label: 'State', group: 'Property' },
  { value: 'parcel_acres', label: 'Parcel Acres', group: 'Property' },
  { value: 'property_address', label: 'Property Address', group: 'Property' },
  { value: 'property_city', label: 'City', group: 'Property' },
  { value: 'property_zip', label: 'Zip Code', group: 'Property' },
  { value: 'parcel_number', label: 'Parcel Number / APN', group: 'Property' },
  // Financial
  { value: 'market_value', label: 'Market Value', group: 'Financial' },
  { value: 'min_offer', label: 'Min Offer', group: 'Financial' },
  { value: 'max_offer', label: 'Max Offer', group: 'Financial' },
  // Meta
  { value: 'labels', label: 'Labels / Tags', group: 'Meta' },
  { value: 'notes', label: 'Notes', group: 'Meta' },
  { value: 'lead_source', label: 'Lead Source', group: 'Meta' },
  { value: 'acquired_by', label: 'Acquired By', group: 'Meta' },
];

const NUMERIC_FIELDS = new Set(['parcel_acres', 'market_value', 'min_offer', 'max_offer']);

type Step = 1 | 2 | 3 | 4;

export const UploadPanel: React.FC = () => {
  const [step, setStep] = useState<Step>(1);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<number, string>>({});
  const [fileName, setFileName] = useState('');
  const [listName, setListName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<UploadBatchResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // ── Batch management state ──
  const [batches, setBatches] = useState<Array<{ batch_id: string; lead_count: number; uploaded_at: string }>>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchLeads, setBatchLeads] = useState<any[]>([]);
  const [batchLeadsLoading, setBatchLeadsLoading] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    try {
      const data = await fetchDialerUploadBatches();
      setBatches(data);
    } catch (err) {
      console.error('Error loading upload batches:', err);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  // Listen for upload progress
  useEffect(() => {
    const unsub = onDialerUploadProgress((data) => setProgress(data));
    return () => unsub();
  }, []);

  // Load batches on mount
  useEffect(() => { loadBatches(); }, [loadBatches]);

  // ── Step 1: File parsing ──

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv') && !file.name.endsWith('.txt')) {
      showToast({ message: 'Please upload a CSV file', type: 'error' });
      return;
    }
    setFileName(file.name);

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 2) {
          showToast({ message: 'CSV must have a header row and at least one data row', type: 'error' });
          return;
        }
        const headerRow = data[0].map(h => h.trim());
        const dataRows = data.slice(1);
        setHeaders(headerRow);
        setRawRows(dataRows);

        // Auto-detect column mappings
        const autoMap: Record<number, string> = {};
        headerRow.forEach((h, i) => {
          const normalized = h.toLowerCase().trim();
          if (FIELD_ALIASES[normalized]) {
            autoMap[i] = FIELD_ALIASES[normalized];
          }
        });
        setColumnMap(autoMap);
        setStep(2);
      },
      error: (err) => {
        showToast({ message: `Parse error: ${err.message}`, type: 'error' });
      },
    });
  }, [showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Step 2: Column mapping helpers ──

  const phoneIsMapped = Object.values(columnMap).includes('phone_number');

  const updateMapping = (colIndex: number, targetField: string) => {
    setColumnMap(prev => {
      const next = { ...prev };
      if (!targetField) {
        delete next[colIndex];
      } else {
        // Remove duplicate mappings for same target
        for (const [k, v] of Object.entries(next)) {
          if (v === targetField && Number(k) !== colIndex) delete next[Number(k)];
        }
        next[colIndex] = targetField;
      }
      return next;
    });
  };

  // ── Step 3: Build mapped rows ──

  const mappedRows = rawRows.map(row => {
    const obj: Record<string, any> = {};
    for (const [colIdx, field] of Object.entries(columnMap)) {
      const val = row[Number(colIdx)]?.trim() || '';
      if (!val) continue;
      if (NUMERIC_FIELDS.has(field)) {
        const num = parseFloat(val.replace(/[,$]/g, ''));
        if (!isNaN(num)) obj[field] = num;
      } else {
        obj[field] = val;
      }
    }
    return obj as UploadLeadRow;
  });

  const validRows = mappedRows.filter(r => {
    const phone = r.phone_number?.replace(/\D/g, '') || '';
    return phone.length >= 10;
  });

  const invalidPhoneCount = mappedRows.length - validRows.length;

  // ── Step 4: Upload ──

  const handleUpload = async () => {
    setUploading(true);
    setProgress(null);
    setResult(null);
    const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await uploadDialerLeads(mappedRows, batchId, listName || fileName.replace(/\.(csv|tsv|txt)$/i, ''));
      setResult(res);
      setStep(4);
      const dncNote = res.dncMatches > 0 ? ` ⚠️ ${res.dncMatches} already in DNC` : '';
      showToast({
        message: `Uploaded ${res.imported} leads (${res.duplicates} dupes, ${res.errors} errors)${dncNote}`,
        type: res.dncMatches > 0 ? 'warning' : res.errors > 0 ? 'error' : 'success',
      });
      // Refresh batch list
      await loadBatches();
    } catch (err: any) {
      showToast({ message: `Upload failed: ${err.message}`, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setRawRows([]);
    setHeaders([]);
    setColumnMap({});
    setFileName('');
    setListName('');
    setProgress(null);
    setResult(null);
    setShowDetails(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExpandBatch = async (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      setBatchLeads([]);
      return;
    }
    setExpandedBatch(batchId);
    setBatchLeadsLoading(true);
    try {
      const leads = await fetchDialerUploadBatchLeads(batchId);
      setBatchLeads(leads);
    } catch (err) {
      console.error('Error loading batch leads:', err);
    } finally {
      setBatchLeadsLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    setDeletingBatch(batchId);
    try {
      const result = await deleteDialerUploadBatch(batchId);
      showToast({ message: `Deleted ${result.deleted} leads from batch`, type: 'success' });
      setConfirmDelete(null);
      if (expandedBatch === batchId) {
        setExpandedBatch(null);
        setBatchLeads([]);
      }
      await loadBatches();
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to delete batch', type: 'error' });
    } finally {
      setDeletingBatch(null);
    }
  };

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-micro text-gray-400">
        {(['Select File', 'Map Columns', 'Preview', 'Results'] as const).map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span className="text-gray-300">›</span>}
            <span className={cn(
              'px-2 py-0.5 rounded',
              step === (i + 1) ? 'bg-gray-900 text-white font-medium' : step > (i + 1) ? 'text-gray-500' : ''
            )}>
              {label}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* ── Step 1: File Drop ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-caption font-medium text-gray-700 mb-1">List Name</label>
            <input
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="e.g. Texas 5+ Acres, March Batch"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
            />
            <p className="text-micro text-gray-400 mt-1">Defaults to the CSV filename if left blank</p>
          </div>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={36} className="mx-auto text-gray-400 mb-3" />
            <p className="text-body font-medium text-gray-700">Drop a CSV file here</p>
            <p className="text-caption text-gray-400 mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        </div>
      )}

      {/* ── Step 2: Column Mapping ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-body font-medium text-gray-800">Map CSV Columns</h3>
              <p className="text-caption text-gray-500 mt-0.5">
                <FileSpreadsheet size={13} className="inline mr-1" />
                {fileName} — {rawRows.length} rows, {headers.length} columns
              </p>
            </div>
            {!phoneIsMapped && (
              <span className="text-caption text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1">
                <AlertTriangle size={13} />
                Phone Number must be mapped
              </span>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 text-gray-500 font-medium w-1/3">CSV Column</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-normal w-1/4">Sample</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Maps To</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, idx) => (
                  <tr key={idx} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-gray-700">{header}</td>
                    <td className="px-3 py-2 text-gray-400 truncate max-w-[150px]">
                      {rawRows[0]?.[idx] || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={columnMap[idx] || ''}
                        onChange={(e) => updateMapping(idx, e.target.value)}
                        className={cn(
                          'w-full px-2 py-1 border rounded text-caption focus:outline-none focus:ring-2 focus:ring-blue-200',
                          columnMap[idx] === 'phone_number'
                            ? 'border-green-300 bg-green-50'
                            : columnMap[idx]
                              ? 'border-blue-200 bg-blue-50/30'
                              : 'border-gray-200'
                        )}
                      >
                        <option value="">— Skip —</option>
                        <optgroup label="Contact">
                          <option value="phone_number">Phone Number *</option>
                          <option value="first_name">First Name</option>
                          <option value="last_name">Last Name</option>
                          <option value="email">Email</option>
                        </optgroup>
                        <optgroup label="Property">
                          <option value="county">County</option>
                          <option value="state">State</option>
                          <option value="parcel_acres">Parcel Acres</option>
                          <option value="property_address">Property Address</option>
                          <option value="property_city">City</option>
                          <option value="property_zip">Zip Code</option>
                          <option value="parcel_number">Parcel Number / APN</option>
                        </optgroup>
                        <optgroup label="Financial">
                          <option value="market_value">Market Value</option>
                          <option value="min_offer">Min Offer</option>
                          <option value="max_offer">Max Offer</option>
                        </optgroup>
                        <optgroup label="Meta">
                          <option value="labels">Labels / Tags</option>
                          <option value="notes">Notes</option>
                          <option value="lead_source">Lead Source</option>
                          <option value="acquired_by">Acquired By</option>
                        </optgroup>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={resetWizard}
              className="flex items-center gap-1 px-3 py-1.5 text-caption text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!phoneIsMapped}
              className={cn(
                'flex items-center gap-1 px-4 py-1.5 text-caption font-medium rounded-md transition-colors',
                phoneIsMapped
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              )}
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-body font-medium text-gray-800">Preview Upload</h3>
              <p className="text-caption text-gray-500 mt-0.5">
                {mappedRows.length} rows total — {validRows.length} valid
                {invalidPhoneCount > 0 && (
                  <span className="text-amber-600 ml-1">({invalidPhoneCount} invalid phones)</span>
                )}
              </p>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-gray-500 font-medium w-8">#</th>
                  {Object.values(columnMap).filter(Boolean).map(field => (
                    <th key={field} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                      {TARGET_FIELDS.find(f => f.value === field)?.label || field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 8).map((row, i) => {
                  const phone = (row.phone_number || '').replace(/\D/g, '');
                  const isInvalid = phone.length < 10;
                  return (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-gray-100 last:border-0',
                        isInvalid && 'bg-amber-50'
                      )}
                    >
                      <td className="px-3 py-1.5 text-gray-400 tabular-nums">{i + 1}</td>
                      {Object.entries(columnMap).filter(([, v]) => v).map(([colIdx, field]) => (
                        <td key={field} className="px-3 py-1.5 text-gray-700 truncate max-w-[180px]">
                          {row[field as keyof typeof row] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mappedRows.length > 8 && (
              <div className="px-3 py-2 text-micro text-gray-400 bg-gray-50 border-t border-gray-100">
                ... and {mappedRows.length - 8} more rows
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1 px-3 py-1.5 text-caption text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || validRows.length === 0}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-caption font-medium rounded-md transition-colors',
                uploading || validRows.length === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Upload {mappedRows.length} Leads
                </>
              )}
            </button>
          </div>

          {/* Progress bar during upload */}
          {uploading && progress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-caption font-medium text-blue-800">Uploading leads...</span>
                <span className="text-micro text-blue-600 tabular-nums">
                  {progress.processed}/{progress.total}
                </span>
              </div>
              <div className="bg-blue-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all"
                  style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Results ── */}
      {step === 4 && result && (
        <div className="space-y-4">
          <h3 className="text-body font-medium text-gray-800">Upload Complete</h3>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <CheckCircle2 size={20} className="mx-auto text-green-600 mb-1" />
              <p className="text-heading font-semibold text-green-800">{result.imported}</p>
              <p className="text-micro text-green-600">Imported</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <AlertTriangle size={20} className="mx-auto text-amber-600 mb-1" />
              <p className="text-heading font-semibold text-amber-800">{result.duplicates}</p>
              <p className="text-micro text-amber-600">Duplicates</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <XCircle size={20} className="mx-auto text-red-600 mb-1" />
              <p className="text-heading font-semibold text-red-800">{result.errors}</p>
              <p className="text-micro text-red-600">Errors</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
              <SkipForward size={20} className="mx-auto text-gray-500 mb-1" />
              <p className="text-heading font-semibold text-gray-700">{result.skipped}</p>
              <p className="text-micro text-gray-500">Skipped</p>
            </div>
          </div>

          {/* DNC warning */}
          {result.dncMatches > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-caption font-medium text-red-800">
                  {result.dncMatches} uploaded lead{result.dncMatches !== 1 ? 's' : ''} already in DNC list
                </p>
                <p className="text-micro text-red-600 mt-0.5">
                  These leads will be blocked by the call guard and won't appear in the queue.
                </p>
              </div>
            </div>
          )}

          {/* Toggle details */}
          {result.details.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-caption text-blue-600 hover:text-blue-800 underline transition-colors"
              >
                {showDetails ? 'Hide' : 'Show'} row details ({result.details.length} rows)
              </button>

              {showDetails && (
                <div className="mt-2 bg-white border border-gray-200 rounded-lg overflow-auto max-h-64">
                  <table className="w-full text-micro">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
                        <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Row</th>
                        <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Phone</th>
                        <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Action</th>
                        <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((d, i) => (
                        <tr key={i} className={cn(
                          'border-b border-gray-50',
                          d.action === 'error' && 'bg-red-50',
                          d.action === 'skipped' && 'bg-gray-50',
                        )}>
                          <td className="px-2 py-1 text-gray-400 tabular-nums">{d.row_index + 1}</td>
                          <td className="px-2 py-1 font-mono text-gray-600">{d.phone || '—'}</td>
                          <td className="px-2 py-1">
                            <span className={cn(
                              'px-1.5 py-0.5 rounded text-micro font-medium',
                              d.action === 'inserted' && 'bg-green-100 text-green-700',
                              d.action === 'updated' && 'bg-blue-100 text-blue-700',
                              d.action === 'skipped' && 'bg-gray-100 text-gray-600',
                              d.action === 'error' && 'bg-red-100 text-red-700',
                            )}>
                              {d.action}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-gray-500 truncate max-w-[200px]">{d.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <button
            onClick={resetWizard}
            className="flex items-center gap-1.5 px-4 py-1.5 text-caption font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            <Upload size={14} /> Upload Another File
          </button>
        </div>
      )}

      {/* ── Recent Uploads ── */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-body font-medium text-gray-800 flex items-center gap-2">
            <Package size={16} /> Recent Uploads
            {batches.length > 0 && (
              <span className="text-micro text-gray-400 font-normal">
                ({batches.reduce((sum, b) => sum + b.lead_count, 0)} total leads)
              </span>
            )}
          </h3>
          <button
            onClick={() => { setBatchesLoading(true); loadBatches(); }}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
            title="Refresh batch list"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {batchesLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : batches.length === 0 ? (
          <p className="text-caption text-gray-400 py-4 text-center">No uploads yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {batches.map((batch) => (
              <div key={batch.batch_id} className="border-b border-gray-100 last:border-0">
                {/* Batch row */}
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => handleExpandBatch(batch.batch_id)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {expandedBatch === batch.batch_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-caption font-medium text-gray-700">
                      {new Date(batch.uploaded_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <span className="text-micro text-gray-500 tabular-nums">
                    {batch.lead_count} lead{batch.lead_count !== 1 ? 's' : ''}
                  </span>
                  {confirmDelete === batch.batch_id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDeleteBatch(batch.batch_id)}
                        disabled={deletingBatch === batch.batch_id}
                        className="px-2 py-0.5 text-micro font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      >
                        {deletingBatch === batch.batch_id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-0.5 text-micro text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(batch.batch_id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete batch and its leads"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Expanded leads */}
                {expandedBatch === batch.batch_id && (
                  <div className="bg-gray-50 border-t border-gray-100 px-3 py-2">
                    {batchLeadsLoading ? (
                      <div className="flex items-center justify-center py-4 text-gray-400">
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    ) : batchLeads.length === 0 ? (
                      <p className="text-micro text-gray-400 py-2 text-center">No leads found.</p>
                    ) : (
                      <table className="w-full text-micro">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1 font-medium">Name</th>
                            <th className="text-left py-1 font-medium">Phone</th>
                            <th className="text-left py-1 font-medium">Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchLeads.map((lead: any) => (
                            <tr key={lead.id} className="border-t border-gray-100">
                              <td className="py-1 text-gray-700">
                                {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '\u2014'}
                              </td>
                              <td className="py-1 font-mono text-gray-500">
                                {formatPhone(lead.phone_normalized)}
                              </td>
                              <td className="py-1 text-gray-500">
                                {[lead.county, lead.state].filter(Boolean).join(', ') || '\u2014'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
