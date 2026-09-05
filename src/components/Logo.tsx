import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

export function Logo({ className = "", showText = true }: { className?: string; showText?: boolean }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 text-white">
        <Zap className="w-5 h-5" fill="currentColor" />
      </div>
      {showText && (
        <span className="font-semibold text-ink-900 tracking-tight">
          RazorFlow<span className="text-brand-600"> AI</span>
        </span>
      )}
    </Link>
  );
}
