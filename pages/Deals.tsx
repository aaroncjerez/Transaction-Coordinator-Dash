import React, { useEffect, useState } from 'react';
import { Search, Plus, Filter, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchAllDeals } from '../lib/database';
import { CreateDealModal } from '../components/CreateDealModal';

// Mock Data Type
import { Deal } from '../types';

export const Deals: React.FC = () => {
    const navigate = useNavigate();
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);


    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchDeals();
    }, []);

    const fetchDeals = async () => {
        try {
            const data = await fetchAllDeals();
            const mappedDeals: Deal[] = data.map((item: any) => ({
                id: item.id,
                airtable_id: item.airtable_id || '',
                deal_name: item.deal_name || item.deal_type || 'Unnamed Deal',
                last_name: item.last_name,
                deal_type: item.deal_type || 'New',
                stage: item.stage || 'New',
                county: item.county,
                state: item.state,
                notes: item.notes,
                purchase_price: item.purchase_price || 0,
                expected_sales_price: item.expected_sales_price || 0,
                contract_execution_date: item.contract_execution_date,
                expected_close_date: item.expected_close_date,
                close_date: item.close_date || 'TBD',
                phone_number: item.phone_number || 'No Phone'
            }));
            setDeals(mappedDeals);
        } catch (err) {
            console.error('Unexpected error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Deals</h2>
                    <p className="text-sm text-gray-500">Manage all active transactions</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors shadow-sm"
                >
                    <Plus size={18} />
                    New Deal
                </button>
            </div>

            {/* Filters (Mock) */}
            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search deals..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                </div>
                <button className="px-4 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50 text-gray-700">
                    <Filter size={18} />
                    Filter
                </button>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="text-center py-20 text-gray-500">Loading deals...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {deals.map((deal) => (
                        <div
                            key={deal.id}
                            onClick={() => navigate(`/deals/${deal.id}`)}
                            className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide">
                                    {deal.stage}
                                </div>
                                <button className="text-gray-400 hover:text-gray-600">
                                    <MoreHorizontal size={20} />
                                </button>
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 mb-1">{deal.deal_name}</h3>
                            <p className="text-sm text-gray-500 mb-4">Phone: {deal.phone_number}</p>

                            <div className="space-y-2 border-t border-gray-100 pt-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Purchase</span>
                                    <span className="font-medium">${deal.purchase_price.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Expected Sales</span>
                                    <span className="font-medium">${deal.expected_sales_price.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Closing</span>
                                    <span className="font-medium">{deal.close_date}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <CreateDealModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchDeals}
            />
        </div>
    );
};

