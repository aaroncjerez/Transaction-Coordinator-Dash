import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { DealViewData, mapDealData } from '../lib/deal-utils';
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

type DetailTab = 'overview' | 'tasks' | 'deadlines' | 'files' | 'activity' | 'analysis' | 'chat';

export const DealDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState<DealViewData | null>(null);
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
      setDeal(mapDealData(dealData));
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
            onClick={() => navigate('/pipeline')}
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
