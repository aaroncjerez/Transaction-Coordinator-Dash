import React, { useState } from 'react';
import {
  DollarSign, Calendar, Phone, MapPin, ChevronDown, ChevronRight,
  Mail, Building2, FileText, User, Link as LinkIcon, AlertTriangle, Clock, Receipt,
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
  deadlines?: Deadline[];
}

export const DealOverview: React.FC<DealOverviewProps> = ({ deal, onDealChange, onDealPersisted, deadlines }) => {
  const stageColor = getStageColor(deal.stage);
  const spread = deal.expected_sales_price - deal.purchase_price;

  const handleFieldUpdate = async (field: string, value: any) => {
    onDealChange(field, value);
    try {
      const result = await updateDealFields(deal.id, {
        [field === 'contract_date' ? 'contract_execution_date' : field]: value,
      });
      onDealPersisted?.(result.fubPush);
    } catch (error) {
      console.error('Error auto-saving:', error);
      onDealPersisted?.();
    }
  };

  const inputClasses = 'w-full bg-subtle border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none mt-0.5';

  const hasParcel = !!(deal.parcel_number || deal.parcel_zip || deal.parcel_link || deal.lot_acreage || deal.drone_photo_link);
  const hasDD = !!(deal.mortgage_on_property || deal.hoa_poa_on_property || deal.title_search || deal.title_exam || deal.survey || deal.soil_test);
  const hasTitleCo = !!(deal.title_company_name || deal.title_company_phone || deal.title_company_email);
  const hasTeam = !!(deal.funder_name || deal.realtor_name || deal.reference_number);
  const hasExtraFinancials = !!(deal.seller_bottom_price || deal.double_close_offer || deal.realtor_price_opinion || deal.misc_deal_expenses);

  return (
    <div className="space-y-3 py-1">
      {/* Stage & Type — always visible, no accordion */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-caption text-gray-500 font-medium block mb-1">Stage</label>
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
        <div className="flex-1">
          <label className="text-caption text-gray-500 font-medium block mb-1">Type</label>
          <select
            value={deal.deal_type}
            onChange={(e) => handleFieldUpdate('deal_type', e.target.value)}
            className={cn(inputClasses, 'cursor-pointer mt-0')}
          >
            {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Deadline Preview — top 3 upcoming, inline */}
      {deadlines && deadlines.length > 0 && (() => {
        const now = Date.now();
        const urgent = deadlines
          .filter(d => !d.is_acknowledged)
          .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
          .slice(0, 3);
        if (urgent.length === 0) return null;
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <span className="text-caption font-semibold text-gray-700 block mb-2">Upcoming Deadlines</span>
            <div className="space-y-1.5">
              {urgent.map(d => {
                const days = Math.ceil((new Date(d.due_date).getTime() - now) / 86_400_000);
                const isOverdue = days < 0;
                return (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    {isOverdue ? (
                      <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                    ) : (
                      <Clock size={13} className={cn('flex-shrink-0', days <= 3 ? 'text-amber-500' : 'text-gray-400')} />
                    )}
                    <span className="flex-1 truncate text-gray-700">{d.label}</span>
                    <span className={cn(
                      'text-micro font-semibold px-1.5 py-0.5 rounded',
                      isOverdue ? 'bg-red-50 text-red-700' : days <= 3 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600',
                    )}>
                      {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Financials — default open */}
      <Section icon={<DollarSign size={13} />} title="Financials" defaultOpen>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-gray-500">Purchase Price</label>
              <input
                type="number"
                value={deal.purchase_price}
                onChange={e => onDealChange('purchase_price', Number(e.target.value))}
                onBlur={e => handleFieldUpdate('purchase_price', Number(e.target.value))}
                className={inputClasses}
              />
            </div>
            <div>
              <label className="text-caption text-gray-500">Expected Sale</label>
              <input
                type="number"
                value={deal.expected_sales_price}
                onChange={e => onDealChange('expected_sales_price', Number(e.target.value))}
                onBlur={e => handleFieldUpdate('expected_sales_price', Number(e.target.value))}
                className={inputClasses}
              />
            </div>
          </div>
          <div className="flex items-center justify-between bg-subtle rounded-md px-3 py-2 border border-gray-200">
            <span className="text-caption text-gray-500">Spread <span className="text-micro text-gray-400 font-normal">before fees</span></span>
            <span className={cn('text-sm font-bold', spread > 0 ? 'text-emerald-600' : spread < 0 ? 'text-red-600' : 'text-gray-500')}>
              ${spread.toLocaleString()}
            </span>
          </div>
          {hasExtraFinancials && (
            <div className="space-y-2 pt-1 border-t border-gray-100">
              {deal.seller_bottom_price != null && deal.seller_bottom_price > 0 && (
                <div>
                  <label className="text-caption text-gray-500">Seller Bottom Price</label>
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
                  <label className="text-caption text-gray-500">Double Close Offer</label>
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
                  <label className="text-caption text-gray-500">Realtor Price Opinion</label>
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
            </div>
          )}
        </div>
      </Section>

      {/* Fees & Profit — default open */}
      <FeesAndProfit deal={deal} spread={spread} onDealChange={onDealChange} handleFieldUpdate={handleFieldUpdate} inputClasses={inputClasses} />

      {/* Dates — default open */}
      <Section icon={<Calendar size={13} />} title="Dates" defaultOpen>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-gray-500">Contract Date</label>
              <input
                type="date"
                value={deal.contract_date === 'TBD' ? '' : deal.contract_date}
                onChange={e => onDealChange('contract_date', e.target.value)}
                onBlur={e => handleFieldUpdate('contract_date', e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label className="text-caption text-gray-500">Close Date</label>
              <input
                type="date"
                value={deal.close_date === 'TBD' ? '' : deal.close_date}
                onChange={e => onDealChange('close_date', e.target.value)}
                onBlur={e => handleFieldUpdate('close_date', e.target.value)}
                className={inputClasses}
              />
            </div>
          </div>
          {deal.contract_end_date && (
            <div>
              <label className="text-caption text-gray-500">Contract End Date</label>
              <input
                type="date"
                value={deal.contract_end_date}
                onChange={e => onDealChange('contract_end_date', e.target.value)}
                onBlur={e => handleFieldUpdate('contract_end_date', e.target.value)}
                className={inputClasses}
              />
            </div>
          )}
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
          onChange={e => onDealChange('notes', e.target.value)}
          onBlur={e => handleFieldUpdate('notes', e.target.value)}
          className={cn(inputClasses, 'min-h-[80px] resize-none mt-0')}
          placeholder="Add notes..."
        />
      </div>
    </div>
  );
};

// ---- Fees & Profit Section ----

const FeesAndProfit: React.FC<{
  deal: DealViewData;
  spread: number;
  onDealChange: (field: string, value: any) => void;
  handleFieldUpdate: (field: string, value: any) => Promise<void>;
  inputClasses: string;
}> = ({ deal, spread, onDealChange, handleFieldUpdate, inputClasses }) => {
  const transactionalFundingFee = deal.transactional_funding_fee || 0;
  const realtorFeePercent = deal.realtor_fee_percent || 0;
  const realtorFeeAmount = deal.realtor_fee_amount || 0;
  const improvementCosts = deal.improvement_costs || 0;
  const miscFees = deal.misc_fees || 0;

  const jlSharePercent = deal.jl_share_percent || 0;
  const jlShareAmount = deal.jl_share_amount || 0;

  const totalFees = transactionalFundingFee + realtorFeeAmount + improvementCosts + miscFees;
  const realizedGrossProfit = spread - totalFees;

  const handleRealtorPercentChange = (percent: number) => {
    onDealChange('realtor_fee_percent', percent);
    const calculatedAmount = Math.round((deal.expected_sales_price * (percent / 100)) * 100) / 100;
    onDealChange('realtor_fee_amount', calculatedAmount);
  };

  const handleRealtorPercentBlur = async (percent: number) => {
    const calculatedAmount = Math.round((deal.expected_sales_price * (percent / 100)) * 100) / 100;
    await handleFieldUpdate('realtor_fee_percent', percent);
    await handleFieldUpdate('realtor_fee_amount', calculatedAmount);
  };

  const handleJlPercentChange = (percent: number) => {
    onDealChange('jl_share_percent', percent);
    const calculatedAmount = Math.round((realizedGrossProfit * (percent / 100)) * 100) / 100;
    onDealChange('jl_share_amount', calculatedAmount);
  };

  const handleJlPercentBlur = async (percent: number) => {
    const calculatedAmount = Math.round((realizedGrossProfit * (percent / 100)) * 100) / 100;
    await handleFieldUpdate('jl_share_percent', percent);
    await handleFieldUpdate('jl_share_amount', calculatedAmount);
  };

  return (
    <Section icon={<Receipt size={13} />} title="Fees & Profit" defaultOpen>
      <div className="space-y-3">
        {/* Row 1: Transactional Funding Fee | Improvement Costs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-caption text-gray-500">Funding Fee</label>
            <input
              type="number"
              value={transactionalFundingFee || ''}
              placeholder="0"
              onChange={e => onDealChange('transactional_funding_fee', Number(e.target.value))}
              onBlur={e => handleFieldUpdate('transactional_funding_fee', Number(e.target.value))}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="text-caption text-gray-500">Improvement Costs</label>
            <input
              type="number"
              value={improvementCosts || ''}
              placeholder="0"
              onChange={e => onDealChange('improvement_costs', Number(e.target.value))}
              onBlur={e => handleFieldUpdate('improvement_costs', Number(e.target.value))}
              className={inputClasses}
            />
          </div>
        </div>

        {/* Row 2: Realtor Fee % | Realtor Fee $ */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-caption text-gray-500">Realtor Fee %</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={realtorFeePercent || ''}
              placeholder="0"
              onChange={e => handleRealtorPercentChange(Number(e.target.value))}
              onBlur={e => handleRealtorPercentBlur(Number(e.target.value))}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="text-caption text-gray-500">Realtor Fee $</label>
            <input
              type="number"
              value={realtorFeeAmount || ''}
              placeholder="0"
              onChange={e => onDealChange('realtor_fee_amount', Number(e.target.value))}
              onBlur={e => handleFieldUpdate('realtor_fee_amount', Number(e.target.value))}
              className={inputClasses}
            />
          </div>
        </div>

        {/* Row 3: Misc Fees */}
        <div>
          <label className="text-caption text-gray-500">Misc Fees</label>
          <input
            type="number"
            value={miscFees || ''}
            placeholder="0"
            onChange={e => onDealChange('misc_fees', Number(e.target.value))}
            onBlur={e => handleFieldUpdate('misc_fees', Number(e.target.value))}
            className={inputClasses}
          />
        </div>

        {/* Summary: Total Fees + Realized Gross Profit */}
        <div className="border-t border-gray-100 pt-2 space-y-1.5">
          <div className="flex items-center justify-between bg-subtle rounded-md px-3 py-1.5 border border-gray-200">
            <span className="text-caption text-gray-500">Total Fees</span>
            <span className="text-sm font-semibold text-gray-600">
              −${totalFees.toLocaleString()}
            </span>
          </div>
          <div className={cn(
            'flex items-center justify-between rounded-md px-3 py-2 border',
            realizedGrossProfit > 0 ? 'bg-emerald-50 border-emerald-200' :
            realizedGrossProfit < 0 ? 'bg-red-50 border-red-200' :
            'bg-subtle border-gray-200'
          )}>
            <span className={cn(
              'text-caption font-medium',
              realizedGrossProfit > 0 ? 'text-emerald-700' :
              realizedGrossProfit < 0 ? 'text-red-700' :
              'text-gray-500'
            )}>Realized Gross Profit</span>
            <span className={cn(
              'text-sm font-bold',
              realizedGrossProfit > 0 ? 'text-emerald-700' :
              realizedGrossProfit < 0 ? 'text-red-700' :
              'text-gray-500'
            )}>
              ${realizedGrossProfit.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Jerez Land Share */}
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-gray-500">JL Share %</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={jlSharePercent || ''}
                placeholder="0"
                onChange={e => handleJlPercentChange(Number(e.target.value))}
                onBlur={e => handleJlPercentBlur(Number(e.target.value))}
                className={inputClasses}
              />
            </div>
            <div>
              <label className="text-caption text-gray-500">JL Share $</label>
              <input
                type="number"
                value={jlShareAmount || ''}
                placeholder="0"
                onChange={e => onDealChange('jl_share_amount', Number(e.target.value))}
                onBlur={e => handleFieldUpdate('jl_share_amount', Number(e.target.value))}
                className={inputClasses}
              />
            </div>
          </div>
          <div className={cn(
            'flex items-center justify-between rounded-md px-3 py-2.5 border',
            jlShareAmount > 0 ? 'bg-blue-50 border-blue-200' :
            jlShareAmount < 0 ? 'bg-red-50 border-red-200' :
            'bg-subtle border-gray-200'
          )}>
            <span className={cn(
              'text-caption font-semibold',
              jlShareAmount > 0 ? 'text-blue-700' :
              jlShareAmount < 0 ? 'text-red-700' :
              'text-gray-500'
            )}>Jerez Land Share</span>
            <span className={cn(
              'text-base font-bold',
              jlShareAmount > 0 ? 'text-blue-700' :
              jlShareAmount < 0 ? 'text-red-700' :
              'text-gray-500'
            )}>
              ${jlShareAmount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
};

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
