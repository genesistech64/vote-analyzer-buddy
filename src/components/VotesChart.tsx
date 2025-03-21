
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { DeputyVoteData, VotePosition } from '@/utils/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VotesChartProps {
  data: DeputyVoteData[];
}

const VotesChart: React.FC<VotesChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    // Initialize counters for each position
    const counts: Record<VotePosition, number> = {
      pour: 0,
      contre: 0,
      abstention: 0,
      absent: 0
    };
    
    // Count occurrences of each position
    data.forEach(vote => {
      counts[vote.position]++;
    });
    
    // Convert to array format required by Recharts
    return [
      { name: 'Pour', value: counts.pour, color: '#22c55e' },        // green
      { name: 'Contre', value: counts.contre, color: '#ef4444' },    // red
      { name: 'Abstention', value: counts.abstention, color: '#f59e0b' }, // amber
      { name: 'Absent', value: counts.absent, color: '#6b7280' }     // gray
    ];
  }, [data]);

  const totalVotes = data.length;
  
  // Don't render the chart if there's no data
  if (totalVotes === 0) return null;

  return (
    <Card className="w-full mb-8 animate-fade-in">
      <CardHeader>
        <CardTitle className="text-center">Répartition des votes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={true}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => 
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [`${value} vote${value !== 1 ? 's' : ''}`, 'Nombre']}
                labelFormatter={(name) => `${name}`}
              />
              <Legend 
                verticalAlign="bottom"
                layout="horizontal"
                formatter={(value, entry, index) => {
                  // @ts-ignore - entry has color property but TypeScript doesn't know
                  const color = entry.color;
                  const count = chartData[index].value;
                  const percentage = ((count / totalVotes) * 100).toFixed(1);
                  return `${value}: ${count} (${percentage}%)`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default VotesChart;
