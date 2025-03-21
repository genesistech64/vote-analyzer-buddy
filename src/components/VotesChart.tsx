
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, Sector } from 'recharts';
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
    
    // Convert to array format required by Recharts and use the vote colors from tailwind config
    return [
      { name: 'Pour', value: counts.pour, color: '#34C759' },        // using vote.pour color
      { name: 'Contre', value: counts.contre, color: '#FF3B30' },    // using vote.contre color
      { name: 'Abstention', value: counts.abstention, color: '#FF9500' }, // using vote.abstention color
      { name: 'Absent', value: counts.absent, color: '#8E8E93' }     // using vote.absent color
    ];
  }, [data]);

  const totalVotes = data.length;
  
  // Don't render the chart if there's no data
  if (totalVotes === 0) return null;

  // Custom active shape to make the hover effect more prominent
  const renderActiveShape = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
    
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 10}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          opacity={0.9}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 12}
          outerRadius={outerRadius + 16}
          fill={fill}
          opacity={0.7}
        />
      </g>
    );
  };

  // State for tracking active index for hover effects
  const [activeIndex, setActiveIndex] = React.useState<number | undefined>(undefined);
  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };
  const onPieLeave = () => {
    setActiveIndex(undefined);
  };

  return (
    <Card className="w-full mb-8 animate-fade-in shadow-md">
      <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-t-lg">
        <CardTitle className="text-center text-xl font-medium text-gray-800">
          Répartition des votes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                labelLine={{ stroke: '#888', strokeWidth: 1, opacity: 0.8 }}
                innerRadius={60}
                outerRadius={120}
                paddingAngle={chartData.some(d => d.value / totalVotes < 0.05) ? 2 : 0}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => 
                  percent > 0.03 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''
                }
                strokeWidth={1}
                stroke="#fff"
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color}
                    style={{
                      filter: activeIndex === index ? 'drop-shadow(0px 0px 6px rgba(0, 0, 0, 0.3))' : 'none'
                    }}
                  />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [`${value} vote${value !== 1 ? 's' : ''}`, 'Nombre']}
                labelFormatter={(name) => `${name}`}
                contentStyle={{ 
                  borderRadius: '8px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #eaeaea',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                }}
              />
              <Legend 
                verticalAlign="bottom"
                layout="horizontal"
                iconType="circle"
                iconSize={10}
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value, entry, index) => {
                  if (!chartData[index]) return value;
                  const count = chartData[index].value;
                  const percentage = ((count / totalVotes) * 100).toFixed(1);
                  return (
                    <span style={{ color: '#333', fontSize: '0.95rem', marginRight: '10px' }}>
                      {value}: <span style={{ fontWeight: 'bold' }}>{count}</span> <span style={{ color: '#777' }}>({percentage}%)</span>
                    </span>
                  );
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
