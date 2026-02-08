import React from 'react';
import {
  DollarSign, Calendar, Phone, MapPin, ExternalLink, ChevronDown,
  Mail, Building2, FileText, Ruler, User, Link as LinkIcon, Hash,
} from 'lucide-react';
import { DEAL_STAGES, DEAL_TYPES, getStageColor } from '../../constants';
import { cn } from '../../lib/utils';
import { updateDealFields } from '../../lib/database';

interface DealOverviewProps {
  deal: {
    id: string;
    deal_name: string;
    deal_type?: string;
    stage: string;
    county: string;
    state: string;
    purchase_price: number;
    expected_sales_price: number;
    contract_date: string;
    close_date: string;
    contract_end_date?: string;
    phone_number: string;
    email?: string;
    notes: string;
    fub_person_id?: string;
    // Parcel
    parcel_number?: string;
    parcel_zip?: string;
    parcel_link?: string;
    lot_acreage?: string;
    drone_photo_link?: string;
    // Financials (extra)
    seller_bottom_price?: number;
    double_close_offer?: number;
    realtor_price_opinion?: number;
    misc_deal_expenses?: string;
    // Due Diligence
    mortgage_on_property?: string;
    hoa_poa_on_property?: string;
    title_search?: string;
    title_exam?: string;
    survey?: string;
    soil_test?: string;
    // Title Company
    title_company_name?: string;
    title_company_phone?: string;
    title_company_email?: string;
    // Team
    funder_name?: string;
    realtor_name?: string;
    reference_number?: string;
  };
  onDealChange: (field: string, value: any) => void;
  onDealPersisted?: (fubPush?: { queued: boolean; success?: boolean; error?: string }) => void;
}

export const DealOverview: React.FC<DealOverviewProps> = ({ deal, onDealChange, onDealPersisted }) => {
  const stageColor = getStageColor(deal.stage);
  const spread = deal.expected_sales_price - deal.purchase_price;

  const handleFieldUpdate = async (field: string, value: any) => {
    onDealChange(field, value);          // Instant local state update (drawer UI)
    try {
      const result = await updateDealFields(deal.id, {
        [field === 'contract_date' ? 'contract_execution_date' : field]: value,
      });
      onDealPersisted?.(result.fubPush); // Refresh Pipeline AFTER DB write succeeds
    } catch (error) {
      console.error('Error auto-saving:', error);
      onDealPersisted?.();               // Still refresh on error so UI isn't stuck
    }
  };

  const inputClasses = 'w-full bg-subtle border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none mt-0.5';
  const labelClasses = 'text-micro uppercase tracking-wider text-gray-400 font-semibold';

  return (
    <div className="space-y-5 py-1">
      {/* Stage */}
      <div>
        <label className={cn(labelClasses, 'mb-1 block')}>Stage</label>
        <div className="relative">
          <select
            value={deal.stage}
            onChange={(e) => handleFieldUpdate('stage', e.target.value)}
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

      {/* Deal Type */}
      <div>
        <label className={cn(labelClasses, 'mb-1 block')}>Type</label>
        <select
          value={deal.deal_type}
          onChange={(e) => handleFieldUpdate('deal_type', e.target.value)}
          className={cn(inputClasses, 'cursor-pointer')}
        >
          {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <hr className="border-gray-100" />

      {/* Financials */}
      <div className="space-y-3">
        <h3 className={cn(labelClasses, 'flex items-center gap-1.5')}>
          <DollarSign size={12} /> Financials
        </h3>
        <div>
          <label className="text-xs text-gray-500">Purchase Price</label>
          <input
            type="number"
            value={deal.purchase_price}
            onChange={e => onDealChange('purchase_price', Number(e.target.value))}
            onBlur={e => handleFieldUpdate('purchase_price', Number(e.target.value))}
            className={inputClasses}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Expected Sale</label>
          <input
            type="number"
            value={deal.expected_sales_price}
            onChange={e => onDealChange('expected_sales_price', Number(e.target.value))}
            onBlur={e => handleFieldUpdate('expected_sales_price', Number(e.target.value))}
            className={inputClasses}
          />
        </div>
        <div className="flex items-center justify-between bg-subtle rounded-md px-3 py-2 border border-gray-200">
          <span className="text-xs text-gray-500">Spread</span>
          <span className={cn('text-sm font-bold', spread > 0 ? 'text-emerald-600' : spread < 0 ? 'text-red-600' : 'text-gray-500')}>
            ${spread.toLocaleString()}
          </span>
        </div>
        {(deal.seller_bottom_price || deal.double_close_offer || deal.realtor_price_opinion || deal.misc_deal_expenses) && (
          <>
            {deal.seller_bottom_price != null && deal.seller_bottom_price > 0 && (
              <div>
                <label className="text-xs text-gray-500">Seller Bottom Price</label>
                <input
                  type="number"
                  value={deal.seller_bottom_price}
                  onChange={e => onDealChange('seller_bottom_price', Number(e.target.value))}
                  onBlur={e => handleFieldUpdate('seller_bottom_price', Number(e.target.value))}
                  className={inputClasses}
                />
              </div>
            )}
            {deal.double_close_offer != null && deal.double_close_offer > 0 && (
              <div>
                <label className="text-xs text-gray-500">Double Close Offer</label>
                <input
                  type="number"
                  value={deal.double_close_offer}
                  onChange={e => onDealChange('double_close_offer', Number(e.target.value))}
                  onBlur={e => handleFieldUpdate('double_close_offer', Number(e.target.value))}
                  className={inputClasses}
                />
              </div>
            )}
            {deal.realtor_price_opinion != null && deal.realtor_price_opinion > 0 && (
              <div>
                <label className="text-xs text-gray-500">Realtor Price Opinion</label>
                <input
                  type="number"
                  value={deal.realtor_price_opinion}
                  onChange={e => onDealChange('realtor_price_opinion', Number(e.target.value))}
                  onBlur={e => handleFieldUpdate('realtor_price_opinion', Number(e.target.value))}
                  className={inputClasses}
                />
              </div>
            )}
            {deal.misc_deal_expenses && (
              <ReadOnlyField label="Misc Expenses" value={deal.misc_deal_expenses} />
            )}
          </>
        )}
      </div>

      <hr className="border-gray-100" />

      {/* Dates */}
      <div className="space-y-3">
        <h3 className={cn(labelClasses, 'flex items-center gap-1.5')}>
          <Calendar size={12} /> Dates
        </h3>
        <div>
          <label className="text-xs text-gray-500">Contract Date</label>
          <input
            type="date"
            value={deal.contract_date === 'TBD' ? '' : deal.contract_date}
            onChange={e => onDealChange('contract_date', e.target.value)}
            onBlur={e => handleFieldUpdate('contract_date', e.target.value)}
            className={inputClasses}
          />
        </div>
        {deal.contract_end_date && (
          <div>
            <label className="text-xs text-gray-500">Contract End Date</label>
            <input
              type="date"
              value={deal.contract_end_date}
              onChange={e => onDealChange('contract_end_date', e.target.value)}
              onBlur={e => handleFieldUpdate('contract_end_date', e.target.value)}
              className={inputClasses}
            />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500">Close Date</label>
          <input
            type="date"
            value={deal.close_date === 'TBD' ? '' : deal.close_date}
            onChange={e => onDealChange('close_date', e.target.value)}
            onBlur={e => handleFieldUpdate('close_date', e.target.value)}
            className={inputClasses}
          />
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Contact & Location */}
      <div className="space-y-3">
        <h3 className={labelClasses}>Contact</h3>
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
        {deal.fub_person_id && (
          <a
            href={`https://jerezland.followupboss.com/2/people/view/${deal.fub_person_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink size={14} />
            View in FUB
          </a>
        )}
      </div>

      {/* Parcel Info — only show if any parcel data exists */}
      {(deal.parcel_number || deal.parcel_zip || deal.parcel_link || deal.lot_acreage || deal.drone_photo_link) && (
        <>
          <hr className="border-gray-100" />
          <div className="space-y-3">
            <h3 className={cn(labelClasses, 'flex items-center gap-1.5')}>
              <MapPin size={12} /> Parcel Info
            </h3>
            {deal.parcel_number && <ReadOnlyField label="Parcel Number" value={deal.parcel_number} />}
            {deal.parcel_zip && <ReadOnlyField label="ZIP Code" value={deal.parcel_zip} />}
            {deal.lot_acreage && <ReadOnlyField label="Lot Acreage" value={deal.lot_acreage} />}
            {deal.parcel_link && (
              <div>
                <span className="text-xs text-gray-500 block">Parcel Link</span>
                <a href={deal.parcel_link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1 mt-0.5 break-all">
                  <LinkIcon size={12} className="flex-shrink-0" />
                  {deal.parcel_link.length > 60 ? deal.parcel_link.slice(0, 60) + '...' : deal.parcel_link}
                </a>
              </div>
            )}
            {deal.drone_photo_link && (
              <div>
                <span className="text-xs text-gray-500 block">Drone Photos</span>
                <a href={deal.drone_photo_link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1 mt-0.5 break-all">
                  <LinkIcon size={12} className="flex-shrink-0" />
                  {deal.drone_photo_link.length > 60 ? deal.drone_photo_link.slice(0, 60) + '...' : deal.drone_photo_link}
                </a>
              </div>
            )}
          </div>
        </>
      )}

      {/* Due Diligence — only show if any DD data exists */}
      {(deal.mortgage_on_property || deal.hoa_poa_on_property || deal.title_search || deal.title_exam || deal.survey || deal.soil_test) && (
        <>
          <hr className="border-gray-100" />
          <div className="space-y-3">
            <h3 className={cn(labelClasses, 'flex items-center gap-1.5')}>
              <FileText size={12} /> Due Diligence
            </h3>
            {deal.mortgage_on_property && <StatusField label="Mortgage on Property" value={deal.mortgage_on_property} />}
            {deal.hoa_poa_on_property && <StatusField label="HOA/POA" value={deal.hoa_poa_on_property} />}
            {deal.title_search && <StatusField label="Title Search" value={deal.title_search} />}
            {deal.title_exam && <StatusField label="Title Exam" value={deal.title_exam} />}
            {deal.survey && <StatusField label="Survey" value={deal.survey} />}
            {deal.soil_test && <StatusField label="Soil Test" value={deal.soil_test} />}
          </div>
        </>
      )}

      {/* Title Company — only show if any title data exists */}
      {(deal.title_company_name || deal.title_company_phone || deal.title_company_email) && (
        <>
          <hr className="border-gray-100" />
          <div className="space-y-3">
            <h3 className={cn(labelClasses, 'flex items-center gap-1.5')}>
              <Building2 size={12} /> Title Company
            </h3>
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
        </>
      )}

      {/* Team — only show if any team data exists */}
      {(deal.funder_name || deal.realtor_name || deal.reference_number) && (
        <>
          <hr className="border-gray-100" />
          <div className="space-y-3">
            <h3 className={cn(labelClasses, 'flex items-center gap-1.5')}>
              <User size={12} /> Team
            </h3>
            {deal.funder_name && <ReadOnlyField label="Funder" value={deal.funder_name} />}
            {deal.realtor_name && <ReadOnlyField label="Realtor" value={deal.realtor_name} />}
            {deal.reference_number && <ReadOnlyField label="Reference #" value={deal.reference_number} />}
          </div>
        </>
      )}

      <hr className="border-gray-100" />

      {/* Notes */}
      <div>
        <label className={cn(labelClasses, 'mb-1 block')}>Notes</label>
        <textarea
          value={deal.notes || ''}
          onChange={e => onDealChange('notes', e.target.value)}
          onBlur={e => handleFieldUpdate('notes', e.target.value)}
          className={cn(inputClasses, 'min-h-[80px] resize-none')}
          placeholder="Add notes..."
        />
      </div>
    </div>
  );
};

// ---- Helper sub-components ----

const ReadOnlyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span className="text-xs text-gray-500 block">{label}</span>
    <span className="text-sm text-gray-800 mt-0.5 block">{value}</span>
  </div>
);

const StatusField: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const lower = value.toLowerCase();
  const isYes = lower === 'yes' || lower === 'true' || lower === 'completed' || lower === 'done' || lower === 'ordered' || lower === 'passed';
  const isNo = lower === 'no' || lower === 'false' || lower === 'none' || lower === 'n/a';
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={cn(
        'text-xs font-medium px-2 py-0.5 rounded',
        isYes ? 'bg-emerald-50 text-emerald-700' :
        isNo ? 'bg-gray-100 text-gray-500' :
        'bg-amber-50 text-amber-700'
      )}>
        {value}
      </span>
    </div>
  );
};
