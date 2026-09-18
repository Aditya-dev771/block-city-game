import { supabase } from './supabase';

export type FeedbackCategory = 'bug' | 'confusing' | 'balance' | 'performance' | 'other';

export async function submitAlphaFeedback(input: { category: FeedbackCategory; description: string; screen?: string; metadata?: Record<string, unknown> }) {
  const { error } = await supabase.rpc('submit_alpha_feedback', {
    category: input.category,
    description: input.description,
    screen: input.screen ?? window.location.pathname,
    metadata: input.metadata ?? {}
  });
  if (error) throw error;
}

export async function logClientError(input: { errorCode: string; actionType?: string; screen?: string; context?: Record<string, unknown> }) {
  await supabase.rpc('log_client_error', {
    error_code: input.errorCode,
    action_type: input.actionType ?? null,
    screen: input.screen ?? window.location.pathname,
    context: input.context ?? {}
  });
}

export async function recordAlphaCohortEvent(eventType: 'ACTIVE' | 'FIRST_JOB' | 'REACHED_MARKET' | 'PROPERTY_LEVEL_2' | 'OPENED_BUSINESS' | 'RETURNED_D1') {
  await supabase.rpc('record_alpha_cohort_event', { event_type: eventType, metadata: {} });
}

export interface AlphaHealth {
  databaseReachable: boolean;
  economyVersion: number;
  latestTelemetryAt: string | null;
  latestClientErrorAt: string | null;
  activePlayersToday: number;
  unresolvedCriticalAnomalies: number;
  invited: number;
  registered: number;
  cohort: Record<string, number>;
}

export async function loadAlphaHealth() {
  const { data, error } = await supabase.rpc('get_alpha_health');
  if (error) throw error;
  return data as AlphaHealth;
}
