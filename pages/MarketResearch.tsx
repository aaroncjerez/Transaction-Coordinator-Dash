import React, { useState, useEffect } from 'react';
import { fetchMarketData } from '../lib/database';
import { RefreshCw, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface MarketData {
    state: string;
    county: string;
    zip_code: string;
    acreage_range: string;
    sold_1yr: number;
    sold_3mo: number;
    active_listings: number;
    absorption_rate: number;
    price_arbitrage_index: number;
    median_active_ppa: number;
    median_sold_ppa: number;
}

export const MarketResearch: React.FC = () => {
    const [data, setData] = useState<MarketData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const marketData = await fetchMarketData();
            setData(marketData || []);
        } catch (err) {
            console.error('Error fetching market data:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchData();
    };

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 h-full scrollbar-hide">
            <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Market Research</h1>
                    <p className="text-sm text-gray-500">Top 100 "Hot Markets" by Absorption Rate</p>
                </div>
                <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="bg-white border-gray-200">
                    <RefreshCw className={`h-4 w-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
            </header>

            <main className="p-6 max-w-7xl mx-auto space-y-6">
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />)}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3">Location</th>
                                        <th className="px-6 py-3">Acreage</th>
                                        <th className="px-6 py-3 text-right">Sold (1yr/3mo)</th>
                                        <th className="px-6 py-3 text-right">Active</th>
                                        <th className="px-6 py-3 text-right">Absorption Rate</th>
                                        <th className="px-6 py-3 text-right">Arbitrage Idx</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {data.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-3 font-medium text-gray-900">
                                                {row.county}, {row.state} {row.zip_code && <span className="text-gray-400 font-normal">({row.zip_code})</span>}
                                            </td>
                                            <td className="px-6 py-3 text-gray-600">{row.acreage_range}</td>
                                            <td className="px-6 py-3 text-right tabular-nums">
                                                {row.sold_1yr} / <span className="text-gray-400">{row.sold_3mo}</span>
                                            </td>
                                            <td className="px-6 py-3 text-right tabular-nums">{row.active_listings}</td>
                                            <td className="px-6 py-3 text-right font-bold text-emerald-600 tabular-nums">
                                                {Number(row.absorption_rate).toFixed(2)}
                                            </td>
                                            <td className={`px-6 py-3 text-right tabular-nums font-medium ${row.price_arbitrage_index > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                {Number(row.price_arbitrage_index).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                    {data.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                                No market data found. Run the scraper to populate.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
