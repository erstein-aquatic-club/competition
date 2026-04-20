import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface PerformanceChartDatum {
  date: string;
  time: number | null;
  timeOther?: number | null;
}

export interface PerformanceChartProps {
  data: PerformanceChartDatum[];
  targetTime: number | null;
  histPoolLen: number;
  otherPoolLen: number;
  compareOther: boolean;
}

function formatAxisTime(v: number): string {
  const min = Math.floor(v / 60);
  const sec = Math.floor(v % 60);
  const cs = Math.round((v % 1) * 100);
  return min > 0 ? `${min}:${String(sec).padStart(2, "0")}` : `${sec}.${String(cs).padStart(2, "0")}`;
}

export default function PerformanceChart({
  data,
  targetTime,
  histPoolLen,
  otherPoolLen,
  compareOther,
}: PerformanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="objLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.85} />
            <stop offset="50%" stopColor="#10b981" stopOpacity={0.85} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85} />
          </linearGradient>
          <filter id="dotGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
        <YAxis
          domain={[
            (dataMin: number) => (targetTime != null ? Math.min(dataMin, targetTime) - 0.5 : dataMin),
            (dataMax: number) => (targetTime != null ? Math.max(dataMax, targetTime) + 0.5 : dataMax),
          ]}
          tick={{ fontSize: 10 }}
          className="text-muted-foreground"
          reversed
          tickFormatter={formatAxisTime}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            const min = Math.floor(value / 60);
            const sec = Math.floor(value % 60);
            const cs = Math.round((value % 1) * 100);
            const display =
              min > 0
                ? `${min}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
                : `${sec}.${String(cs).padStart(2, "0")}`;
            const label = name === "timeOther" ? `${otherPoolLen}m` : `${histPoolLen}m`;
            return [display, label];
          }}
          labelStyle={{ fontSize: 11 }}
          contentStyle={{ borderRadius: 12, fontSize: 12 }}
        />
        {targetTime != null && (
          <ReferenceLine
            y={targetTime}
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="8 4"
            ifOverflow="extendDomain"
          />
        )}
        <Line
          type="monotone"
          dataKey="time"
          name="time"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={(props: unknown) => {
            const { cx: dx, cy: dy, payload, key } = props as {
              cx: number;
              cy: number;
              payload: PerformanceChartDatum;
              key: string | number;
            };
            if (payload.time == null) return <g key={key} />;
            const beats = targetTime != null && payload.time <= targetTime;
            return beats ? (
              <g key={key} filter="url(#dotGlow)">
                <circle cx={dx} cy={dy} r={4.5} fill="#10b981" stroke="#fff" strokeWidth={1.5} />
              </g>
            ) : (
              <circle key={key} cx={dx} cy={dy} r={3} fill="hsl(var(--primary))" stroke="#fff" strokeWidth={1} />
            );
          }}
          activeDot={{ r: 5 }}
          connectNulls
        />
        {compareOther && (
          <Line
            type="monotone"
            dataKey="timeOther"
            name="timeOther"
            stroke="hsl(var(--chart-2, 25 95% 53%))"
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
