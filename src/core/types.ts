// ─── Event Types ───

export type EventType =
  | 'tool_call'
  | 'tool_result'
  | 'assistant_message'
  | 'user_message'
  | 'error'
  | 'system';

export type EventSource = 'mock' | 'file';

export interface NormalizedEvent {
  id: string;
  timestamp: number;
  sequence: number;
  type: EventType;
  source: EventSource;
  tool?: string;
  target?: string;
  payloadSize: number;
  summary: string;
  rawSnippet?: string; // max 200 chars
  tags: string[];
}

// ─── Raw event from ingestion (before normalization) ───

export interface RawEvent {
  type: string;
  tool?: string;
  target?: string;
  content?: string;
  error?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

// ─── State Types ───

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PhaseStatus = 'starting' | 'working' | 'warning' | 'critical';
export type InterventionType = 'none' | 'review' | 'pause' | 'stop';
export type RedFlagCategory = 'context_danger' | 'looping' | 'risky_action';

export interface KeyAction {
  sequence: number;
  timestamp: number;
  summary: string;
  tool?: string;
  target?: string;
}

export interface ProgressMarker {
  sequence: number;
  timestamp: number;
  description: string;
  type:
  | 'file_created'
  | 'file_edited'
  | 'build_passed'
  | 'test_passed'
  | 'command_succeeded'
  | 'patch_applied'
  | 'other';
}

export interface RedFlag {
  id: string;
  category: RedFlagCategory;
  ruleId: string;
  severity: RiskLevel;
  title: string;
  reason: string;
  suggestedAction: string;
  triggeredAt: number;
  relatedEventId: string;
}

export interface SupervisorState {
  sessionId: string;
  originalTask: string;
  constraints: string[];
  currentPhase: PhaseStatus;
  recentKeyActions: KeyAction[];
  progressMarkers: ProgressMarker[];
  activeRedFlags: RedFlag[];
  riskLevel: RiskLevel;
  lastMeaningfulProgressAt: number | null;
  recommendedAction: InterventionType;
  stats: {
    totalEvents: number;
    repeatedActionCount: number;
    largeOutputCount: number;
    riskyActionCount: number;
  };
}

// ─── Rule Types ───

export interface Rule {
  id: string;
  category: RedFlagCategory;
  name: string;
  enabled: boolean;
  evaluate: (
    event: NormalizedEvent,
    state: SupervisorState,
    recentEvents: NormalizedEvent[]
  ) => RedFlag | null;
}

// ─── API Response Types ───

export type LobstermanMode = 'demo' | 'file' | 'telegram';

export interface DashboardResponse {
  state: SupervisorState;
  updatedAt: number;
  mode: LobstermanMode;
}

export interface EventsResponse {
  events: NormalizedEvent[];
  total: number;
}

// ─── Ingestion Types ───

export type EventCallback = (event: NormalizedEvent) => void;

export interface EventSourceAdapter {
  start: (callback: EventCallback) => void;
  stop: () => void;
  isRunning: () => boolean;
}

// ─── Engine Callback Types ───

export type OnRuleTriggered = (flag: RedFlag, event: NormalizedEvent) => void;
export type OnRiskChanged = (oldLevel: RiskLevel, newLevel: RiskLevel, flags: RedFlag[]) => void;
export type OnSessionStart = (sessionId: string, task: string) => void;
export type OnSessionEnd = (sessionId: string, stats: SupervisorState['stats']) => void;

export interface EngineCallbacks {
  onRuleTriggered?: OnRuleTriggered;
  onRiskChanged?: OnRiskChanged;
  onSessionStart?: OnSessionStart;
  onSessionEnd?: OnSessionEnd;
}

// ─── Operator Decision Types ───

export type OperatorDecisionType = 'acknowledged' | 'flagged_for_review' | 'pause_requested' | 'stop_requested';

export interface OperatorDecision {
  id: string;
  timestamp: number;
  decision: OperatorDecisionType;
  ruleId?: string;
  flagId?: string;
  userId?: string;
  note?: string;
}

