import { InterventionType, RedFlag } from '../core/types';

const interventionConfig: Record<
    InterventionType,
    { label: string; description: string; bg: string; text: string; border: string; icon: string }
> = {
    none: {
        label: 'No Intervention Needed',
        description: 'Session is progressing normally.',
        bg: 'bg-gray-900/50',
        text: 'text-gray-500',
        border: 'border-gray-800',
        icon: '✓',
    },
    review: {
        label: 'Human Review Recommended',
        description: 'Check the agent\'s recent actions and approach.',
        bg: 'bg-amber-900/20',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        icon: '👁',
    },
    pause: {
        label: 'Consider Pausing the Agent',
        description: 'Multiple issues detected. Pause and assess before continuing.',
        bg: 'bg-orange-900/20',
        text: 'text-orange-400',
        border: 'border-orange-500/30',
        icon: '⏸',
    },
    stop: {
        label: 'Stop the Agent Immediately',
        description: 'Critical issues detected. Stop the agent and review.',
        bg: 'bg-red-900/20',
        text: 'text-red-400',
        border: 'border-red-500/30',
        icon: '⛔',
    },
};

export function InterventionPanel({
    recommendedAction,
    activeFlags,
}: {
    recommendedAction: InterventionType;
    activeFlags: RedFlag[];
}) {
    const config = interventionConfig[recommendedAction];

    return (
        <div className={`rounded-xl border ${config.border} ${config.bg} p-5`}>
            <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-3">
                Recommended Action
            </h3>
            <div className="flex items-start gap-3">
                <span className="text-2xl">{config.icon}</span>
                <div>
                    <p className={`text-sm font-semibold ${config.text}`}>
                        {config.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        {config.description}
                    </p>
                    {activeFlags.length > 0 && recommendedAction !== 'none' && (
                        <p className="text-xs text-gray-500 mt-2">
                            Top concern: {activeFlags[0]?.title}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
