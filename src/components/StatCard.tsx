import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: ReactNode;
  trend?: { value: string; positive?: boolean };
}

export function StatCard({ label, value, subValue, icon, trend }: StatCardProps) {
  return (
    <div className="card p-5 card-hover">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="stat-label">{label}</p>
          <p className="stat-value mt-2">{value}</p>
          {subValue && <p className="text-xs text-ink-400 mt-1">{subValue}</p>}
          {trend && (
            <p className={`text-xs mt-2 font-medium ${trend.positive ? "text-success-600" : "text-error-600"}`}>
              {trend.positive ? "▲" : "▼"} {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-ink-50 text-ink-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
