import React, { useEffect, useState, useCallback } from 'react';
import { X, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';
import { Deal } from '../types';
import { fetchDealById } from '../lib/database';
import { getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { DealOverview } from './deal/DealOverview';
import { DealTasks } from './deal/DealTasks';
import { DealDeadlines } from './deal/DealDeadlines';
import { DealFiles } from './deal/DealFiles';
import { DealChat } from './DealChat';
import { DealActivity } from './deal/DealActivity';
import { SkeletonDrawer } from './ui/Skeleton';

type DrawerTab = 'overview' | 'tasks' | 'deadlines' | 'files' | 'activity' | 'chat';

interface DealDrawerProps {
  dealId: string | null;
  onClose: () => void;
  onDealUpdate?: () => void;
}

interface DealData {
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
}

export const DealDrawer: React.FC<DealDrawerProps> = ({ dealId, onClose, onDealUpdate }) => {
  const [deal, setDeal] = useState<DealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [fubSyncStatus, setFubSyncStatus] = useState<'idle' | 'synced' | 'pending' | null>(null);

  const fetchDeal = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await fetchDealById(id);
      if (!data) {
        setDeal(null);
        return;
      }
      setDeal({
        id: data.id,
        deal_name: data.deal_name || 'Unnamed Deal',
        deal_type: data.deal_type || 'Unclassified',
        stage: data.stage || 'Purchase Agreement Signed',
        county: data.county || '',
        state: data.state || '',
        purchase_price: data.purchase_price || 0,
        expected_sales_price: data.expected_sales_price || 0,
        contract_date: data.contract_execution_date || 'TBD',
        close_date: data.close_date || 'TBD',
        contract_end_date: data.contract_end_date || undefined,
        phone_number: data.phone_number || '',
        email: data.email || undefined,
        notes: data.notes || '',
        fub_person_id: data.fub_person_id || undefined,
        // Parcel
        parcel_number: data.parcel_number || undefined,
        parcel_zip: data.parcel_zip || undefined,
        parcel_link: data.parcel_link || undefined,
        lot_acreage: data.lot_acreage || undefined,
        drone_photo_link: data.drone_photo_link || undefined,
        // Financials (extra)
        seller_bottom_price: data.seller_bottom_price || undefined,
        double_close_offer: data.double_close_offer || undefined,
        realtor_price_opinion: data.realtor_price_opinion || undefined,
        misc_deal_expenses: data.misc_deal_expenses || undefined,
        // Due Diligence
        mortgage_on_property: data.mortgage_on_property || undefined,
        hoa_poa_on_property: data.hoa_poa_on_property || undefined,
        title_search: data.title_search || undefined,
        title_exam: data.title_exam || undefined,
        survey: data.survey || undefined,
        soil_test: data.soil_test || undefined,
        // Title Company
        title_company_name: data.title_company_name || undefined,
        title_company_phone: data.title_company_phone || undefined,
        title_company_email: data.title_company_email || undefined,
        // Team
        funder_name: data.funder_name || undefined,
        realtor_name: data.realtor_name || undefined,
        reference_number: data.reference_number || undefined,
      });
    } catch (err) {
      console.error('Failed to fetch deal:', err);
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dealId) {
      fetchDeal(dealId);
      setActiveTab('overview');
    }
  }, [dealId, fetchDeal]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Auto-dismiss FUB sync indicator after 3s
  useEffect(() => {
    if (!fubSyncStatus || fubSyncStatus === 'idle') return;
    const t = setTimeout(() => setFubSyncStatus(null), 3000);
    return () => clearTimeout(t);
  }, [fubSyncStatus]);

  // Local-only: instant drawer state update (no Pipeline refresh)
  const handleLocalChange = (field: string, value: any) => {
    setDeal(prev => prev ? { ...prev, [field]: value } : null);
  };

  // Called AFTER the DB write completes — now safe to refresh Pipeline
  const handlePersisted = async (fubPush?: { queued: boolean; success?: boolean; error?: string }) => {
    try {
      await onDealUpdate?.();
    } catch (err) {
      console.error('[DealDrawer] Pipeline refresh failed:', err);
    }
    // Show FUB sync indicator
    if (fubPush?.queued) {
      setFubSyncStatus(fubPush.success ? 'synced' : 'pending');
    }
  };

  const isOpen = !!dealId;

  if (!isOpen) return null;

  const stageColor = deal ? getStageColor(deal.stage) : null;

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'deadlines', label: 'Deadlines' },
    { id: 'files', label: 'Files' },
    { id: 'activity', label: 'Activity' },
    { id: 'chat', label: 'Chat' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className="fixed top-0 right-0 h-full w-drawer max-w-[90vw] bg-white shadow-lg z-50 flex flex-col animate-slide-in-right"
        role="dialog"
        aria-label="Deal details"
        aria-modal="true"
      >
        {loading ? (
          <SkeletonDrawer />
        ) : !deal ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Deal not found
          </div>
        ) : (
          <>
            {/* Header */}
            <div className={cn('border-b border-gray-200 px-5 pt-4 pb-3 flex-shrink-0')}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 truncate leading-tight">
                    {deal.deal_name}
                  </h2>
                  {(deal.county || deal.state) && (
                    <p className="text-caption text-gray-500 mt-0.5">
                      {[deal.county, deal.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {deal.fub_person_id && (
                    <a
                      href={`https://jerezland.followupboss.com/2/people/view/${deal.fub_person_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary-light rounded transition-colors"
                      title="View in FUB"
                      aria-label="View in Follow Up Boss"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    onClick={onClose}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    aria-label="Close drawer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Stage badge + FUB sync indicator */}
              <div className="flex items-center gap-2">
                {stageColor && (
                  <span className={cn(
                    'inline-flex text-micro font-semibold px-2 py-0.5 rounded',
                    stageColor.light, stageColor.lightText
                  )}>
                    {deal.stage}
                  </span>
                )}
                {fubSyncStatus === 'synced' && (
                  <span className="inline-flex items-center gap-1 text-micro font-medium text-emerald-600 animate-fade-in">
                    <CheckCircle2 size={12} />
                    FUB synced
                  </span>
                )}
                {fubSyncStatus === 'pending' && (
                  <span className="inline-flex items-center gap-1 text-micro font-medium text-amber-600 animate-fade-in">
                    <Loader2 size={12} className="animate-spin" />
                    FUB pending
                  </span>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-3 -mb-3" role="tablist" aria-label="Deal sections">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={cn(
                      'px-3 py-2 text-caption font-medium border-b-2 transition-colors',
                      activeTab === tab.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
              {activeTab === 'overview' && (
                <DealOverview deal={deal} onDealChange={handleLocalChange} onDealPersisted={handlePersisted} />
              )}
              {activeTab === 'tasks' && stageColor && (
                <DealTasks dealId={deal.id} stageHex={stageColor.hex} />
              )}
              {activeTab === 'deadlines' && (
                <DealDeadlines dealId={deal.id} />
              )}
              {activeTab === 'files' && (
                <DealFiles dealId={deal.id} fubPersonId={deal.fub_person_id} />
              )}
              {activeTab === 'activity' && (
                <DealActivity dealId={deal.id} fubPersonId={deal.fub_person_id} />
              )}
              {activeTab === 'chat' && (
                <DealChat dealId={deal.id} dealName={deal.deal_name} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};
