import { RiskLevel, RedFlagCategory } from '../core/types';

const riskColors: Record<RiskLevel, { bg: string; text: string; border: string; glow: string }> = {
    low: {
        bg: 'bg-emerald-900/30',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
        glow: '',
    },
    medium: {
        bg: 'bg-amber-900/30',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        glow: '',
    },
    high: {
        bg: 'bg-orange-900/30',
        text: 'text-orange-400',
        border: 'border-orange-500/30',
        glow: '',
    },
    critical: {
        bg: 'bg-red-900/30',
        text: 'text-red-400',
        border: 'border-red-500/40',
        glow: 'animate-pulse',
    },
};

export function getRiskColors(level: RiskLevel) {
    return riskColors[level];
}

export function RiskBadge({
    level,
    size = 'md',
}: {
    level: RiskLevel;
    size?: 'sm' | 'md' | 'lg';
}) {
    const colors = riskColors[level];
    const sizeClasses = {
        sm: 'text-xs px-1.5 py-0.5',
        md: 'text-sm px-2 py-0.5',
        lg: 'text-base px-3 py-1',
    };

    return (
        <span
            className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${colors.bg} ${colors.text} ${colors.border} border ${sizeClasses[size]} ${colors.glow}`}
        >
            {level}
        </span>
    );
}

const categoryLabels: Record<RedFlagCategory, string> = {
    context_danger: 'Context Danger',
    looping: 'Looping',
    risky_action: 'Risky Action',
};

export function CategoryLabel({ category }: { category: RedFlagCategory }) {
    return <span>{categoryLabels[category]}</span>;
}
