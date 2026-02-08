import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { fetchDealById, updateDealFields, listFiles } from '../lib/database';
import { getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { TopBar } from '../components/TopBar';
import { DealOverview } from '../components/deal/DealOverview';
import { DealTasks } from '../components/deal/DealTasks';
import { DealDeadlines } from '../components/deal/DealDeadlines';
import { DealFiles } from '../components/deal/DealFiles';
import { DealAnalyzer } from '../components/DealAnalyzer';
import { DealChat } from '../components/DealChat';
import { DealActivity } from '../components/deal/DealActivity';

// ---- Types ----

interface DealDetailData {
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

type DetailTab = 'overview' | 'tasks' | 'deadlines' | 'files' | 'activity' | 'analysis' | 'chat';

// ---- Main Component ----

export const DealDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<DealDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  useEffect(() => {
    if (id) fetchDealData(id);
  }, [id]);

  const fetchDealData = async (dealId: string) => {
    try {
      setLoading(true);
      const dealData = await fetchDealById(dealId);
      if (!dealData) throw new Error('Deal not found');

      setDeal({
        id: dealData.id,
        deal_name: dealData.deal_name || 'Unnamed Deal',
        deal_type: dealData.deal_type || 'Unclassified',
        stage: dealData.stage || 'Purchase Agreement Signed',
        county: dealData.county || '',
        state: dealData.state || '',
        purchase_price: dealData.purchase_price || 0,
        expected_sales_price: dealData.expected_sales_price || 0,
        contract_date: dealData.contract_execution_date || 'TBD',
        close_date: dealData.close_date || 'TBD',
        contract_end_date: dealData.contract_end_date || undefined,
        phone_number: dealData.phone_number || '',
        email: dealData.email || undefined,
        notes: dealData.notes || '',
        fub_person_id: dealData.fub_person_id || undefined,
        // Parcel
        parcel_number: dealData.parcel_number || undefined,
        parcel_zip: dealData.parcel_zip || undefined,
        parcel_link: dealData.parcel_link || undefined,
        lot_acreage: dealData.lot_acreage || undefined,
        drone_photo_link: dealData.drone_photo_link || undefined,
        // Financials (extra)
        seller_bottom_price: dealData.seller_bottom_price || undefined,
        double_close_offer: dealData.double_close_offer || undefined,
        realtor_price_opinion: dealData.realtor_price_opinion || undefined,
        misc_deal_expenses: dealData.misc_deal_expenses || undefined,
        // Due Diligence
        mortgage_on_property: dealData.mortgage_on_property || undefined,
        hoa_poa_on_property: dealData.hoa_poa_on_property || undefined,
        title_search: dealData.title_search || undefined,
        title_exam: dealData.title_exam || undefined,
        survey: dealData.survey || undefined,
        soil_test: dealData.soil_test || undefined,
        // Title Company
        title_company_name: dealData.title_company_name || undefined,
        title_company_phone: dealData.title_company_phone || undefined,
        title_company_email: dealData.title_company_email || undefined,
        // Team
        funder_name: dealData.funder_name || undefined,
        realtor_name: dealData.realtor_name || undefined,
        reference_number: dealData.reference_number || undefined,
      });
    } catch (error) {
      console.error('Error fetching deal details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDealChange = (field: string, value: any) => {
    setDeal(prev => prev ? { ...prev, [field]: value } : null);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading deal details...</div>;
  if (!deal) return <div className="p-8 text-center text-red-500">Deal not found.</div>;

  const stageColor = getStageColor(deal.stage);

  const tabs: { id: DetailTab; label: string; icon?: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'deadlines', label: 'Deadlines' },
    { id: 'files', label: 'Files' },
    { id: 'activity', label: 'Activity' },
    { id: 'analysis', label: 'Analysis', icon: <Sparkles size={14} /> },
    { id: 'chat', label: 'Chat' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* TopBar */}
      <TopBar
        title={deal.deal_name}
        subtitle={[deal.county, deal.state].filter(Boolean).join(', ') || undefined}
        actions={
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-caption text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Pipeline
          </button>
        }
      />

      {/* Stage badge + tabs */}
      <div className="border-b border-gray-200 bg-white px-5">
        <div className="flex items-center gap-3 pt-3 pb-2">
          <span className={cn(
            'text-micro font-semibold px-2 py-0.5 rounded',
            stageColor.light, stageColor.lightText
          )}>
            {deal.stage}
          </span>
          <span className="text-micro text-gray-400">{deal.deal_type}</span>
        </div>
        <div className="flex gap-1 -mb-px" role="tablist" aria-label="Deal sections">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                'px-3 py-2 text-caption font-medium border-b-2 transition-colors flex items-center gap-1.5',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-5 py-5">
          {activeTab === 'overview' && (
            <DealOverview deal={deal} onDealChange={handleDealChange} />
          )}
          {activeTab === 'tasks' && (
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
          {activeTab === 'analysis' && (
            <DealAnalyzer dealId={deal.id} />
          )}
          {activeTab === 'chat' && (
            <DealChat dealId={deal.id} dealName={deal.deal_name} />
          )}
        </div>
      </div>
    </div>
  );
};
