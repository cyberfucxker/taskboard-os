import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_SERIES, TOOLTIP_STYLE } from './chartColors';

interface DonutChartProps {
  data: { name: string; value: number }[];
  colors?: string[];
  height?: number;
}

export function DonutChart({ data, colors = CHART_SERIES, height = 220 }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2} strokeWidth={0}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: 'var(--ink)' }} labelStyle={{ color: 'var(--ink2)' }} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-2">
        {data.map((entry, i) => (
          <li key={entry.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-ink-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
              {entry.name}
            </span>
            <span className="font-medium text-ink">
              {entry.value}
              <span className="ml-1 text-ink-faint">({total ? Math.round((entry.value / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
