import { ReactNode } from "react";

interface LoadingProps {
  message?: string;
  fullPage?: boolean;
}

export function Loading({ message = "Loading...", fullPage }: LoadingProps) {
  return (
    <div className={`flex items-center justify-center ${fullPage ? "min-h-screen" : "py-20"}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-ink-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-ink-500">{message}</p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-12 h-12 rounded-full bg-error-100 flex items-center justify-center text-error-600 text-xl font-semibold">!</div>
      <p className="mt-4 text-sm text-ink-600 text-center max-w-md">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-4">Retry</button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="text-ink-300 mb-3">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink-700">{title}</h3>
      {description && <p className="text-xs text-ink-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
