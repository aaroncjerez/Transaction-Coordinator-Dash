import React, { useState } from 'react';
import {
  DollarSign, Calendar, Phone, MapPin, ChevronDown, ChevronRight,
  Mail, Building2, FileText, User, Link as LinkIcon,
} from 'lucide-react';
import { Deadline } from '../../types';
import { DealViewData } from '../../lib/deal-utils';
import { DEAL_STAGES, DEAL_TYPES, getStageColor } from '../../constants';
import { cn } from '../../lib/utils';
import { updateDealFields } from '../../lib/database';

interface DealOverviewProps {
  deal: DealViewData;
  onDealChange: (field: string, value: any) => void;
  onDealPersisted?: (fubPush?: { queued: boolean; success?: boolean; error?: string }) => void;
  queueSave?: (field: string, value: any) => void;
  deadlines?: Deadline[];
  onDeadlinesRefresh?: () => void;
}

export const DealOverview: React.FC<DealOverviewProps> = ({ deal, onDealChange, onDealPersisted, queueSave, deadlines, onDeadlinesRefresh }) => {
  const stageColor = getStageColor(deal.stage);

  /** Immediate save for dropdowns (stage, type) — single-action discrete changes */
  const handleImmediateSave = async (field: string, value: any) => {
    onDealChange(field, value);
    try {
      const result = await updateDealFields(deal.id, {
        [field === 'contract_date' ? 'contract_execution_date' : field]: value,
      });
      onDealPersisted?.(result.fubPush);
    } catch (error) {
      console.error('Error saving:', error);
      onDealPersisted?.();
    }
  };

  /** Debounced save for text/number/date inputs — queues via useAutoSave */
  const handleFieldChange = (field: string, value: any) => {
    onDealChange(field, value);
    const dbField = field === 'contract_date' ? 'contract_execution_date' : field;
    queueSave?.(dbField, value);
  };

  const inputClasses = 'w-full bg-subtle border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none mt-0.5';

  const hasParcel = !!(deal.parcel_number || deal.parcel_zip || deal.parcel_link || deal.lot_acreage || deal.drone_photo_link);
  const hasDD = !!(deal.mortgage_on_property || deal.hoa_poa_on_property || deal.title_search || deal.title_exam || deal.survey || deal.soil_test);
  const hasTitleCo = !!(deal.title_company_name || deal.title_company_phone || deal.title_company_email);
  const hasTeam = !!(deal.funder_name || deal.realtor_name || deal.reference_number);


  return (
    <div className="space-y-3 py-1">
      {/* Stage & Type — always visible, no accordion */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-caption text-gray-500 font-medium block mb-1">Stage</label>
          <div className="relative">
            <select
              value={deal.stage}
              onChange={(e) => handleImmediateSave('stage', e.target.value)}
              className={cn(
                'w-full text-sm font-semibold rounded-md px-3 py-2 border appearance-none cursor-pointer transition-all',
                'focus:ring-2 focus:ring-offset-1 focus:ring-primary/30',
                stageColor.bg, stageColor.text, stageColor.border
              )}
            >
              {DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1">
          <label className="text-caption text-gray-500 font-medium block mb-1">Type</label>
          <select
            value={deal.deal_type}
            onChange={(e) => handleImmediateSave('deal_type', e.target.value)}
            className={cn(inputClasses, 'cursor-pointer mt-0')}
          >
            {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Financials — simplified: Purchase Price + Profit only */}
      <Section icon={<DollarSign size={13} />} title="Financials" defaultOpen>
        <div className="space-y-3">
          <div>
            <label className="text-caption text-gray-500">Purchase Price</label>
            <input
              type="number"
              value={deal.purchase_price}
              onChange={e => handleFieldChange('purchase_price', Number(e.target.value))}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="text-caption text-gray-500">Profit</label>
            <div className="grid grid-cols-2 gap-3 items-end">
              <input
                type="number"
                value={deal.realized_gross_profit || ''}
                placeholder="0"
                onChange={e => {
                  handleFieldChange('realized_gross_profit', Number(e.target.value));
                }}
                className={inputClasses}
              />
              {(deal.realized_gross_profit != null && deal.realized_gross_profit !== 0) && (
                <div className={cn(
                  'flex items-center justify-center rounded-md px-3 py-1.5 border mt-0.5',
                  deal.realized_gross_profit > 0 ? 'bg-emerald-50 border-emerald-200' :
                  'bg-red-50 border-red-200'
                )}>
                  <span className={cn(
                    'text-sm font-bold',
                    deal.realized_gross_profit > 0 ? 'text-emerald-700' : 'text-red-700'
                  )}>
                    ${deal.realized_gross_profit.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Dates — Possession Date & Close Date */}
      <Section icon={<Calendar size={13} />} title="Dates" defaultOpen>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-gray-500 font-medium">Possession Date</label>
              <input
                type="date"
                value={deal.possession_date || ''}
                onChange={e => handleFieldChange('possession_date', e.target.value)}
                className={cn(inputClasses, 'text-base py-2 font-semibold')}
              />
              {deal.possession_date && (() => {
                const days = Math.ceil((new Date(deal.possession_date).getTime() - Date.now()) / 86400000);
                if (days < 0) return <span className="text-micro text-gray-400 mt-0.5 block">Possessed {Math.abs(days)}d ago</span>;
                if (days === 0) return <span className="text-micro text-blue-600 font-semibold mt-0.5 block">Possession today</span>;
                return <span className={cn('text-micro font-semibold mt-0.5 block', days <= 7 ? 'text-amber-600' : 'text-gray-500')}>Possession in {days}d</span>;
              })()}
            </div>
            <div>
              <label className="text-caption text-gray-500 font-medium">Close Date</label>
              <input
                type="date"
                value={deal.close_date === 'TBD' ? '' : deal.close_date}
                onChange={e => handleFieldChange('close_date', e.target.value)}
                className={cn(inputClasses, 'text-base py-2 font-semibold')}
              />
              {deal.close_date && deal.close_date !== 'TBD' && (() => {
                const days = Math.ceil((new Date(deal.close_date).getTime() - Date.now()) / 86400000);
                if (days < 0) return <span className="text-micro text-gray-400 mt-0.5 block">Closed {Math.abs(days)}d ago</span>;
                if (days === 0) return <span className="text-micro text-red-600 font-semibold mt-0.5 block">Closing today</span>;
                return <span className={cn('text-micro font-semibold mt-0.5 block', days <= 7 ? 'text-amber-600' : 'text-gray-500')}>Closes in {days}d</span>;
              })()}
            </div>
          </div>
        </div>
      </Section>

      {/* Contact — default open */}
      <Section icon={<Phone size={13} />} title="Contact" defaultOpen>
        <div className="space-y-2">
          {deal.phone_number && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Phone size={14} className="text-gray-400" />
              <span>{deal.phone_number}</span>
            </div>
          )}
          {deal.email && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Mail size={14} className="text-gray-400" />
              <span>{deal.email}</span>
            </div>
          )}
          {(deal.county || deal.state) && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <MapPin size={14} className="text-gray-400" />
              <span>{[deal.county, deal.state].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </div>
      </Section>

      {/* Parcel Info — collapsed by default, only if data exists */}
      {hasParcel && (
        <Section icon={<MapPin size={13} />} title="Parcel Info" defaultOpen={false}>
          <div className="space-y-2">
            {deal.parcel_number && <ReadOnlyField label="Parcel Number" value={deal.parcel_number} />}
            {deal.parcel_zip && <ReadOnlyField label="ZIP Code" value={deal.parcel_zip} />}
            {deal.lot_acreage && <ReadOnlyField label="Lot Acreage" value={deal.lot_acreage} />}
            {deal.parcel_link && (
              <div>
                <span className="text-caption text-gray-500 block">Parcel Link</span>
                <a href={deal.parcel_link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1 mt-0.5 break-all">
                  <LinkIcon size={12} className="flex-shrink-0" />
                  {deal.parcel_link.length > 60 ? deal.parcel_link.slice(0, 60) + '...' : deal.parcel_link}
                </a>
              </div>
            )}
            {deal.drone_photo_link && (
              <div>
                <span className="text-caption text-gray-500 block">Drone Photos</span>
                <a href={deal.drone_photo_link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1 mt-0.5 break-all">
                  <LinkIcon size={12} className="flex-shrink-0" />
                  {deal.drone_photo_link.length > 60 ? deal.drone_photo_link.slice(0, 60) + '...' : deal.drone_photo_link}
                </a>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Due Diligence — collapsed by default */}
      {hasDD && (
        <Section icon={<FileText size={13} />} title="Due Diligence" defaultOpen={false}>
          <div className="space-y-2">
            {deal.mortgage_on_property && <StatusField label="Mortgage on Property" value={deal.mortgage_on_property} />}
            {deal.hoa_poa_on_property && <StatusField label="HOA/POA" value={deal.hoa_poa_on_property} />}
            {deal.title_search && <StatusField label="Title Search" value={deal.title_search} />}
            {deal.title_exam && <StatusField label="Title Exam" value={deal.title_exam} />}
            {deal.survey && <StatusField label="Survey" value={deal.survey} />}
            {deal.soil_test && <StatusField label="Soil Test" value={deal.soil_test} />}
          </div>
        </Section>
      )}

      {/* Title Company — collapsed by default */}
      {hasTitleCo && (
        <Section icon={<Building2 size={13} />} title="Title Company" defaultOpen={false}>
          <div className="space-y-2">
            {deal.title_company_name && <ReadOnlyField label="Name" value={deal.title_company_name} />}
            {deal.title_company_phone && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Phone size={14} className="text-gray-400" />
                <span>{deal.title_company_phone}</span>
              </div>
            )}
            {deal.title_company_email && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Mail size={14} className="text-gray-400" />
                <span>{deal.title_company_email}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Team — collapsed by default */}
      {hasTeam && (
        <Section icon={<User size={13} />} title="Team" defaultOpen={false}>
          <div className="space-y-2">
            {deal.funder_name && <ReadOnlyField label="Funder" value={deal.funder_name} />}
            {deal.realtor_name && <ReadOnlyField label="Realtor" value={deal.realtor_name} />}
            {deal.reference_number && <ReadOnlyField label="Reference #" value={deal.reference_number} />}
          </div>
        </Section>
      )}

      {/* Notes — always visible */}
      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <label className="text-caption text-gray-500 font-medium block mb-1.5">Notes</label>
        <textarea
          value={deal.notes || ''}
          onChange={e => handleFieldChange('notes', e.target.value)}
          className={cn(inputClasses, 'min-h-[80px] resize-none mt-0')}
          placeholder="Add notes..."
        />
      </div>
    </div>
  );
};

// ---- Fees & Profit Section ----


// ---- Collapsible Section ----

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}> = ({ icon, title, defaultOpen, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-subtle transition-colors"
      >
        {isOpen ? (
          <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />
        )}
        <span className="text-gray-500">{icon}</span>
        <span className="text-caption font-semibold text-gray-700 flex-1 text-left">{title}</span>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-0">
          {children}
        </div>
      )}
    </div>
  );
};

// ---- Helper sub-components ----

const ReadOnlyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span className="text-caption text-gray-500 block">{label}</span>
    <span className="text-sm text-gray-800 mt-0.5 block">{value}</span>
  </div>
);

const StatusField: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const lower = value.toLowerCase();
  const isYes = lower === 'yes' || lower === 'true' || lower === 'completed' || lower === 'done' || lower === 'ordered' || lower === 'passed';
  const isNo = lower === 'no' || lower === 'false' || lower === 'none' || lower === 'n/a';
  return (
    <div className="flex items-center justify-between">
      <span className="text-caption text-gray-500">{label}</span>
      <span className={cn(
        'text-caption font-medium px-2 py-0.5 rounded',
        isYes ? 'bg-emerald-50 text-emerald-700' :
        isNo ? 'bg-gray-100 text-gray-500' :
        'bg-amber-50 text-amber-700'
      )}>
        {value}
      </span>
    </div>
  );
};
