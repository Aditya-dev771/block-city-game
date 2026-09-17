import { describe,expect,it } from 'vitest';
import { anomalySeverity, approximateSessionMinutes, coinHealth, fpPaceHealth, funnelConversions, pressureHealth, profitHealth, propertyTiming, resourceHealth, retentionRate } from './alphaAnalytics';
import { gameErrorCode,gameErrorMessage } from '../services/errorMessages';
describe('Milestone 6 Alpha analytics',()=>{
 it('classifies coin health',()=>{expect(coinHealth(.84)).toBe('LOW');expect(coinHealth(1)).toBe('HEALTHY');expect(coinHealth(1.16)).toBe('HIGH')});
 it('classifies resource flow',()=>{expect(resourceHealth(-20,100)).toBe('DEFLATIONARY');expect(resourceHealth(5,100)).toBe('BALANCED');expect(resourceHealth(20,100)).toBe('INFLATIONARY')});
 it('classifies supply, profit, and FP pace',()=>{expect(pressureHealth(60,100)).toBe('HIGH');expect(profitHealth(-1)).toBe('NEGATIVE');expect(profitHealth(101)).toBe('HIGH');expect(fpPaceHealth(46)).toBe('FAST')});
 it('estimates observed sessions',()=>{expect(approximateSessionMinutes('2026-01-01T00:00:00Z','2026-01-01T00:05:20Z')).toBe(5)});
 it('calculates property progression without fabricating unknowns',()=>{expect(propertyTiming('2026-01-01T00:00:00Z',null,null)).toEqual({accountToLevel2Hours:null,level2ToLevel3Hours:null});expect(propertyTiming('2026-01-01T00:00:00Z','2026-01-02T00:00:00Z','2026-01-02T12:00:00Z')).toEqual({accountToLevel2Hours:24,level2ToLevel3Hours:12})});
 it('suppresses tiny retention cohorts',()=>{expect(retentionRate(4,2)).toBeNull();expect(retentionRate(10,4)).toBe(.4)});
 it('calculates funnel conversions',()=>{expect(funnelConversions({created:100,job:50,craft:25})).toEqual([{stage:'created',count:100,fromPrevious:null},{stage:'job',count:50,fromPrevious:.5},{stage:'craft',count:25,fromPrevious:.5}])});
 it('classifies review severity',()=>{expect(anomalySeverity('MARKET_CHURN',1)).toBe('LOW');expect(anomalySeverity('MARKET_CHURN',5)).toBe('MEDIUM');expect(anomalySeverity('EXTREME_COIN_GAIN',1)).toBe('HIGH')});
 it('maps stable server errors without exposing SQL',()=>{expect(gameErrorCode('raise STORAGE_FULL')).toBe('STORAGE_FULL');expect(gameErrorMessage('STORAGE_FULL')).toContain('Storage is full');expect(gameErrorMessage('some internal detail')).not.toContain('internal')});
});
