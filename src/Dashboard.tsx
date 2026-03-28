import React, { useMemo, useState } from 'react';
import { QuotationData } from './App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, parse, isValid, subDays, isAfter, startOfDay } from 'date-fns';
import { FileText, DollarSign, TrendingUp, Calendar, Filter } from 'lucide-react';
import { translations, Language } from './translations';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280', '#F97316', '#06B6D4'];

interface DashboardProps {
  quotations: QuotationData[];
  language: Language;
}

export function Dashboard({ quotations, language }: DashboardProps) {
  const t = translations[language];
  const [dateFilter, setDateFilter] = useState<'7days' | '30days' | 'all'>('all');

  const stats = useMemo(() => {
    let totalAmount = 0;
    let totalItems = 0;

    const trendDataMap: Record<string, { name: string, total: number }> = {};
    const itemUsageMap: Record<string, number> = {};

    const today = startOfDay(new Date());
    const filterDate = dateFilter === '7days' ? subDays(today, 7) : dateFilter === '30days' ? subDays(today, 30) : null;

    // Filter quotations based on date
    const filteredQuotations = quotations.filter(q => {
      if (!filterDate) return true;
      let dateObj = new Date();
      if (q.date) {
        const parts = q.date.split('.');
        if (parts.length === 3) {
          dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }
      return isValid(dateObj) && isAfter(dateObj, filterDate);
    });

    filteredQuotations.forEach(q => {
      const qTotal = q.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) - (Number(q.discount) || 0);
      totalAmount += qTotal;
      totalItems += q.items.length;

      // Track item usage by quantity
      q.items.forEach(item => {
        const name = item.particulars?.trim();
        const qty = Number(item.qty) || 0;
        if (name && qty > 0) {
          itemUsageMap[name] = (itemUsageMap[name] || 0) + qty;
        }
      });

      // Parse date (assuming DD.MM.YYYY format from the app)
      let dateObj = new Date();
      if (q.date) {
        const parts = q.date.split('.');
        if (parts.length === 3) {
          dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }
      
      if (isValid(dateObj)) {
        // Group by day for 7/30 days, group by month for 'all'
        const dateFormat = dateFilter === 'all' ? 'MMM yyyy' : 'dd MMM';
        const sortKey = dateFilter === 'all' ? format(dateObj, 'yyyy-MM') : format(dateObj, 'yyyy-MM-dd');
        const displayKey = format(dateObj, dateFormat);
        
        // Store both display name and total, using sortKey as the map key
        if (!trendDataMap[sortKey]) {
          trendDataMap[sortKey] = { name: displayKey, total: 0 };
        }
        trendDataMap[sortKey].total += qTotal;
      }
    });

    // Sort trend data chronologically using the sortKey
    const trendData = Object.entries(trendDataMap)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([_, data]) => data);

    // Process item usage for Pie Chart
    const allItems = Object.entries(itemUsageMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    let topItems = allItems;
    if (allItems.length > 8) {
      const top = allItems.slice(0, 8);
      const othersValue = allItems.slice(8).reduce((sum, item) => sum + item.value, 0);
      topItems = [...top, { name: t.others, value: othersValue }];
    }

    return {
      totalQuotations: filteredQuotations.length,
      totalAmount,
      totalItems,
      averageAmount: filteredQuotations.length > 0 ? totalAmount / filteredQuotations.length : 0,
      trendData,
      topItems,
      filteredQuotations
    };
  }, [quotations, dateFilter, t.others]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MMK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value).replace('MMK', 'Ks');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{t.dashboard}</h2>
        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          <button 
            onClick={() => setDateFilter('7days')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dateFilter === '7days' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t.last7Days}
          </button>
          <button 
            onClick={() => setDateFilter('30days')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dateFilter === '30days' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t.last30Days}
          </button>
          <button 
            onClick={() => setDateFilter('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dateFilter === 'all' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t.allTime}
          </button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{t.totalQuotations}</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalQuotations}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{t.totalAmount}</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalAmount)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{t.averageQuotation}</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.averageAmount)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{t.totalItemsQuoted}</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalItems}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {t.revenueTrend}
          </h3>
          <div className="h-80">
            {stats.trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(value) => `${value / 1000000}M`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    cursor={{ fill: '#F3F4F6' }}
                  />
                  <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                {t.noDataAvailable}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{t.quotationTrend}</h3>
          <div className="h-80">
            {stats.trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(value) => `${value / 1000000}M`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  />
                  <Line type="monotone" dataKey="total" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                {t.noDataAvailable}
              </div>
            )}
          </div>
        </div>

        {/* Most Used Items Pie Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{t.mostUsedItems}</h3>
          <div className="h-[450px] sm:h-96">
            {stats.topItems.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.topItems}
                    cx="50%"
                    cy="45%"
                    labelLine={true}
                    label={({ name, percent }) => `${name.length > 12 ? name.substring(0, 12) + '..' : name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius="55%"
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {stats.topItems.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, 'Total Quantity']} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                {t.noItemDataAvailable}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Recent Quotations List */}
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 mt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{t.recentQuotations}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500">
                <th className="pb-3 pr-4 font-medium whitespace-nowrap">{t.quotationNo}</th>
                <th className="pb-3 pr-4 font-medium whitespace-nowrap">{t.date}</th>
                <th className="pb-3 pr-4 font-medium whitespace-nowrap">{t.items}</th>
                <th className="pb-3 font-medium text-right whitespace-nowrap">{t.amount}</th>
              </tr>
            </thead>
            <tbody>
              {stats.filteredQuotations.slice(0, 5).map((q) => {
                const total = q.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) - (Number(q.discount) || 0);
                return (
                  <tr key={q.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="py-3 pr-4 font-medium text-gray-900 whitespace-nowrap">{q.quotationNumber || t.untitled}</td>
                    <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{q.date}</td>
                    <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">{q.items.length}</td>
                    <td className="py-3 text-right font-medium text-gray-900 whitespace-nowrap">{formatCurrency(total)}</td>
                  </tr>
                );
              })}
              {stats.filteredQuotations.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">{t.noQuotationsFoundPeriod}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
