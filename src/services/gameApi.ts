import { supabase } from './supabase';
import type { ActionResult, BusinessRecipeId, BusinessType, GameActionName, JobType, MarketResourceId, PlayerGameState, RecipeId } from '../types/game';

export async function loadPlayerState(): Promise<PlayerGameState> {
  const { data, error } = await supabase.rpc('get_player_game_state');
  if (error) throw error;
  return data as PlayerGameState;
}

type ActionPayload =
  | { action: 'execute_job'; jobType: JobType }
  | { action: 'craft_item'; recipeId: RecipeId }
  | { action: 'use_meal' }
  | { action: 'complete_order'; orderId: string }
  | { action: 'market_buy' | 'market_sell'; resourceId: MarketResourceId; quantity: number }
  | { action: 'upgrade_property' | 'fund_property_upgrade'; targetLevel: 2 | 3 }
  | { action: 'open_business'; businessType: BusinessType }
  | { action: 'assign_resident_to_business' | 'unassign_resident_from_business'; residentId: string; businessId: string }
  | { action: 'start_business_production'; businessId: string; recipeId: BusinessRecipeId }
  | { action: 'claim_business_production'; productionId: string }
  | { action: 'claim_daily_quest'; questId:string }
  | { action: 'claim_weekly_streak' }
  | { action: 'claim_achievement'; achievementId:string };

export async function performGameAction(payload: ActionPayload, idempotencyKey: string): Promise<ActionResult> {
  const body: ActionPayload & { idempotencyKey: string } = { ...payload, idempotencyKey };
  const { data, error } = await supabase.functions.invoke('game-action', { body });
  if (error) {
    let message = error.message;
    if ('context' in error && error.context instanceof Response) {
      try {
        const details = await error.context.clone().json() as { error?: string };
        if (details.error) message = details.error;
      } catch { /* Preserve the transport error when the response is not JSON. */ }
    }
    throw new Error(message);
  }
  return data as ActionResult;
}

export type { GameActionName };

export async function saveLocation(location: string): Promise<void> {
  const { error } = await supabase.rpc('set_current_location', { next_location: location });
  if (error) throw error;
}
