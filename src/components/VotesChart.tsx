
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts';
import { DeputyVoteData, VotePosition } from '@/utils/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent, ChartTooltip } from '@/components/ui/chart';
import { HelpCircle } from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VotesChartProps {
  data: DeputyVoteData[];
  groupePolitique?: string;
}

const VotesChart: React.FC<VotesChartProps> = ({ data, groupePolitique }) => {
  // Ensure data is an array before processing
  const safeData = Array.isArray(data) ? data : [];
  
  const chartData = useMemo(() => {
    const counts: Record<VotePosition, number> = {
      pour: 0,
      contre: 0,
      abstention: 0,
      absent: 0
    };
    
    safeData.forEach(vote => {
      counts[vote.position]++;
    });
    
    return [
      { name: 'Pour', value: counts.pour, color: '#34C759' },
      { name: 'Contre', value: counts.contre, color: '#FF3B30' },
      { name: 'Abstention', value: counts.abstention, color: '#FF9500' },
      { name: 'Absent', value: counts.absent, color: '#8E8E93' }
    ];
  }, [safeData]);

  const totalVotes = safeData.length;
  const presentVotes = totalVotes - (chartData.find(item => item.name === 'Absent')?.value || 0);
  const presenceRate = totalVotes > 0 ? (presentVotes / totalVotes) * 100 : 0;
  
  // Determine circle color based on participation rate
  const circleColor = presenceRate < 30 ? '#FF3B30' : '#34C759';
  
  if (totalVotes === 0) return null;

  return (
    <>
      {/* Presence Rate Card */}
      <Card className="w-full animate-fade-in shadow-md">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium text-gray-800">
              Taux de présence
            </CardTitle>
            <UITooltip>
              <TooltipTrigger>
                <HelpCircle size={16} className="text-gray-400 hover:text-gray-600" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4">
                <div className="space-y-2">
                  <p className="font-medium">Comment est calculé ce taux ?</p>
                  <p>Le taux de présence représente le pourcentage des scrutins où le député a voté "Pour", "Contre" ou s'est abstenu.</p>
                  <p>Formule : (Votes exprimés ÷ Total des scrutins) × 100</p>
                  <p className="text-xs text-gray-500 mt-2">Note : Les votes "Absent" sont considérés comme une non-participation.</p>
                </div>
              </TooltipContent>
            </UITooltip>
          </div>
          <CardDescription className="text-sm text-gray-600">
            Pourcentage des scrutins où le député était présent
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 flex flex-col items-center justify-center">
          <div className="relative h-40 w-40 flex items-center justify-center">
            <div className="absolute text-5xl font-bold text-primary">
              {presenceRate.toFixed(1)}%
            </div>
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle 
                cx="50" 
                cy="50" 
                r="45" 
                fill="none" 
                stroke="#f3f4f6" 
                strokeWidth="10" 
              />
              <circle 
                cx="50" 
                cy="50" 
                r="45" 
                fill="none" 
                stroke={circleColor} 
                strokeWidth="10" 
                strokeDasharray={`${2 * Math.PI * 45 * presenceRate / 100} ${2 * Math.PI * 45 * (100 - presenceRate) / 100}`}
                strokeDashoffset={2 * Math.PI * 45 * 25 / 100} 
                strokeLinecap="round"
                transform="rotate(-90 50 50)" 
              />
            </svg>
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {presentVotes} votes exprimés sur {totalVotes} scrutins
          </div>
        </CardContent>
      </Card>

      {/* Vote Distribution Card */}
      <Card className="w-full animate-fade-in shadow-md">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-t-lg">
          <CardTitle className="text-lg font-medium text-gray-800">
            Répartition des votes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                layout="vertical"
                margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis 
                  type="number"
                  tickFormatter={(value) => `${value}`} 
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 14, fontWeight: 500 }}
                  width={80}
                />
                <Tooltip
                  formatter={(value) => [`${value} vote${value !== 1 ? 's' : ''}`, 'Nombre']}
                  contentStyle={{ 
                    borderRadius: '8px', 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #eaeaea',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                  }}
                />
                <Bar 
                  dataKey="value" 
                  radius={[4, 4, 4, 4]}
                  barSize={30}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList 
                    dataKey="value" 
                    position="right" 
                    style={{ 
                      fill: '#374151', 
                      fontSize: 14,
                      fontWeight: 500 
                    }}
                    formatter={(value: number) => `${value} (${((value / totalVotes) * 100).toFixed(1)}%)`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default VotesChart;
