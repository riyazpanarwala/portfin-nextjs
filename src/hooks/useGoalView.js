'use client';

import { useMemo, useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';

const DEFAULT_GOAL = {
  corpus: 10_000_000,
  targetYear: 2035,
  returnPct: 12,
  sipMonthly: 21_355,
  stepUpSip: 10_000,
  stepUpPct: 10,
  stepUpReturnPct: 12,
  stepUpYears: 15,
};

const START_YEAR = 2026;
const CURRENT_PORTFOLIO_FALLBACK = 3_941_000;
const MONTHS_IN_YEAR = 12;

function monthlyRate(annualPct) {
  return Math.max(0, annualPct) / 100 / MONTHS_IN_YEAR;
}

function annuityDueFactor(rate, months) {
  if (months <= 0) return 0;
    if (rate === 0) return months;
  return ((Math.pow(1 + rate, months) - 1) / rate) * (1 + rate);
}

function sipRequired({ target, current, years, annualReturnPct }) {
  const months = Math.max(0, years * MONTHS_IN_YEAR);
  const rate = monthlyRate(annualReturnPct);
  const currentFutureValue = current * Math.pow(1 + rate, months);
  const gap = Math.max(0, target - currentFutureValue);
  const factor = annuityDueFactor(rate, months);
  return factor > 0 ? gap / factor : 0;
}

function projectFromCurrent({ current, sipMonthly, years, annualReturnPct, stepUpPct = 0 }) {
  const data = [];
  let corpus = current;
  let invested = 0;
  let sip = sipMonthly;
  const rate = monthlyRate(annualReturnPct);

  data.push({ year: START_YEAR, label: String(START_YEAR), corpus, invested, sip });

  for (let y = 1; y <= years; y += 1) {
    for (let m = 0; m < MONTHS_IN_YEAR; m += 1) {
      corpus = (corpus + sip) * (1 + rate);
      invested += sip;
    }
    data.push({
      year: START_YEAR + y,
      label: String(START_YEAR + y),
      corpus: Math.round(corpus),
      invested: Math.round(invested),
      sip: Math.round(sip),
    });
    sip *= 1 + stepUpPct / 100;
  }

  return data;
}

function deterministicCorridors({ current, sipMonthly, years, annualReturnPct, target }) {
  const median = projectFromCurrent({ current, sipMonthly, years, annualReturnPct });
  const p10 = projectFromCurrent({ current, sipMonthly, years, annualReturnPct: Math.max(1, annualReturnPct - 4) });
  const p75 = projectFromCurrent({ current, sipMonthly, years, annualReturnPct: annualReturnPct + 3 });
  const p90 = projectFromCurrent({ current, sipMonthly, years, annualReturnPct: annualReturnPct + 5 });

  return median.map((d, i) => ({
    year: d.year,
    label: d.label,
    p10: p10[i]?.corpus ?? d.corpus,
    median: d.corpus,
    p75: p75[i]?.corpus ?? d.corpus,
    p90: p90[i]?.corpus ?? d.corpus,
    currentPace: d.corpus,
    goal: target,
  }));
}

function stepUpProjection({ sipMonthly, years, annualReturnPct, stepUpPct }) {
  const data = [];
  let corpus = 0;
  let invested = 0;
  let sip = sipMonthly;
  const rate = monthlyRate(annualReturnPct);

  for (let y = 1; y <= years; y += 1) {
    const annualDeploy = sip * MONTHS_IN_YEAR;
    for (let m = 0; m < MONTHS_IN_YEAR; m += 1) {
      corpus = (corpus + sip) * (1 + rate);
      invested += sip;
    }
    data.push({
      year: y,
      label: `Yr ${y}`,
      sip: Math.round(sip),
      annualDeploy: Math.round(annualDeploy),
      corpus: Math.round(corpus),
      invested: Math.round(invested),
      gain: Math.round(corpus - invested),
    });
    sip *= 1 + stepUpPct / 100;
  }

  return data;
}

function futureValue(principal, years, annualReturnPct) {
  const months = Math.max(0, years * MONTHS_IN_YEAR);
  return principal * Math.pow(1 + monthlyRate(annualReturnPct), months);
}

export function useGoalView() {
  const { stats, monthlyFlow } = usePortfolio();
  const [goal, setGoal] = useState(DEFAULT_GOAL);

  const currentPortfolio = Math.max(0, stats?.totalValue || CURRENT_PORTFOLIO_FALLBACK);
  const activeBuyingMonths = (monthlyFlow ?? []).filter(month => month.amount > 0).length;
  const activeTotalInvested = stats?.totalInvested ?? (stats?.mfInvested ?? 0) + (stats?.stInvested ?? 0);
  const avgMonthlySip = activeBuyingMonths > 0 ? activeTotalInvested / activeBuyingMonths : 0;
  const currentMonthlySip = avgMonthlySip || goal.sipMonthly;
  const stepUpBaseSip = goal.stepUpSip;
  const yearsRemaining = Math.max(1, goal.targetYear - START_YEAR);
  const setField = key => value => setGoal(g => ({ ...g, [key]: Number(value) }));

  const projection = useMemo(() => projectFromCurrent({
    current: currentPortfolio,
    sipMonthly: currentMonthlySip,
    years: yearsRemaining,
    annualReturnPct: goal.returnPct,
  }), [currentPortfolio, currentMonthlySip, goal.returnPct, yearsRemaining]);

  const finalCorpus = projection[projection.length - 1]?.corpus || 0;
  const totalFutureInvested = projection[projection.length - 1]?.invested || 0;
  const goalAchieved = finalCorpus >= goal.corpus;
  const sipNeeded = sipRequired({
    target: goal.corpus,
    current: currentPortfolio,
    years: yearsRemaining,
    annualReturnPct: goal.returnPct,
  });
  const goalPct = Math.min(100, (finalCorpus / goal.corpus) * 100);

  const scenarios = useMemo(() => {
    const rows = [8, 10, 12, 15, 18].map(rate => {
      const needed = sipRequired({
        target: goal.corpus,
        current: currentPortfolio,
        years: yearsRemaining,
        annualReturnPct: rate,
      });
      const pace = projectFromCurrent({
        current: currentPortfolio,
        sipMonthly: currentMonthlySip,
        years: yearsRemaining,
        annualReturnPct: rate,
      }).at(-1)?.corpus || 0;
      const extraSipNeeded = Math.max(0, needed - currentMonthlySip);
      const onTrack = extraSipNeeded <= 1 || pace >= goal.corpus;

      return {
        rate,
        needed,
        extraSipNeeded,
        finalCorpus: pace,
        baselineSip: currentMonthlySip,
        onTrack,
      };
    });
    const maxExtraSip = Math.max(...rows.map(row => row.extraSipNeeded), 1);

    return rows.map(row => ({
      ...row,
      progressPct: row.onTrack ? 0 : Math.max(6, Math.min(100, (row.extraSipNeeded / maxExtraSip) * 100)),
    }));
  }, [currentPortfolio, currentMonthlySip, goal.corpus, yearsRemaining]);

  const milestones = useMemo(() => [0.25, 0.5, 0.75, 1].map(pct => {
    const amount = goal.corpus * pct;
    const hit = projection.find(d => d.corpus >= amount);
    const reached = currentPortfolio >= amount;
    return {
      pct,
      amount,
      year: hit?.year ?? null,
      reached,
    };
  }), [currentPortfolio, goal.corpus, projection]);

  const monteCarlo = useMemo(() => {
    const paths = deterministicCorridors({
      current: currentPortfolio,
      sipMonthly: currentMonthlySip,
      years: yearsRemaining,
      annualReturnPct: goal.returnPct,
      target: goal.corpus,
    });
    const terminal = paths.at(-1);
    const probability = Math.max(8, Math.min(96, Math.round(100 - ((goal.corpus - terminal.median) / goal.corpus) * 85)));

    return {
      paths,
      probability,
      median: terminal.median,
      pessimistic: terminal.p10,
      optimistic: terminal.p90,
    };
  }, [currentPortfolio, currentMonthlySip, goal.corpus, goal.returnPct, yearsRemaining]);

  const stepUpData = useMemo(() => stepUpProjection({
    sipMonthly: stepUpBaseSip,
    years: goal.stepUpYears,
    annualReturnPct: goal.stepUpReturnPct,
    stepUpPct: goal.stepUpPct,
  }), [stepUpBaseSip, goal.stepUpYears, goal.stepUpReturnPct, goal.stepUpPct]);

  const flatStepData = useMemo(() => stepUpProjection({
    sipMonthly: stepUpBaseSip,
    years: goal.stepUpYears,
    annualReturnPct: goal.stepUpReturnPct,
    stepUpPct: 0,
  }), [stepUpBaseSip, goal.stepUpYears, goal.stepUpReturnPct]);

  const finalStepUp = stepUpData.at(-1)?.corpus || 0;
  const finalFlatStep = flatStepData.at(-1)?.corpus || 0;
  const stepUpInvested = stepUpData.at(-1)?.invested || 0;
  const flatInvested = flatStepData.at(-1)?.invested || 0;
  const finalStepSip = stepUpData.at(-1)?.sip || stepUpBaseSip;
  const currentPortfolioFutureValue = futureValue(currentPortfolio, goal.stepUpYears, goal.stepUpReturnPct);

  const stepUpChartData = stepUpData.map((d, i) => ({
    ...d,
    flatCorpus: flatStepData[i]?.corpus || 0,
    currentPortfolio: futureValue(currentPortfolio, d.year, goal.stepUpReturnPct) + d.corpus,
  }));

  const stepRateScenarios = [0, 5, 10, 15, 20, 25].map(rate => {
    const data = stepUpProjection({
      sipMonthly: stepUpBaseSip,
      years: goal.stepUpYears,
      annualReturnPct: goal.stepUpReturnPct,
      stepUpPct: rate,
    });
    return {
      rate,
      corpus: data.at(-1)?.corpus || 0,
      multiplier: finalFlatStep > 0 ? (data.at(-1)?.corpus || 0) / finalFlatStep : 1,
      finalSip: data.at(-1)?.sip || stepUpBaseSip,
    };
  });

  return {
    goal,
    setField,
    currentPortfolio,
    avgMonthlySip,
    currentMonthlySip,
    stepUpBaseSip,
    yearsRemaining,
    projection,
    finalCorpus,
    totalFutureInvested,
    goalAchieved,
    sipNeeded,
    goalPct,
    scenarios,
    milestones,
    monteCarlo,
    stepUpData,
    flatStepData,
    stepUpChartData,
    finalStepUp,
    finalFlatStep,
    stepUpInvested,
    flatInvested,
    finalStepSip,
    currentPortfolioFutureValue,
    stepRateScenarios,
  };
}
