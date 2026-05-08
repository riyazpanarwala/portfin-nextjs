'use client';

import { useState, useMemo } from 'react';
import { projectWealth } from '@/lib/store';

const DEFAULT_GOAL = {
  corpus: 10_000_000,
  years: 20,
  returnPct: 12,
  sipMonthly: 25_000,
  stepUp: 10,
};

export function useGoalView() {
  const [goal, setGoal] = useState(DEFAULT_GOAL);

  const setField = (key) => (value) => setGoal(g => ({ ...g, [key]: +value }));

  const projection = useMemo(() =>
    projectWealth(goal.sipMonthly, goal.years, goal.returnPct / 100, 0),
    [goal.sipMonthly, goal.years, goal.returnPct]
  );

  const stepUpProjection = useMemo(() =>
    projectWealth(goal.sipMonthly, goal.years, goal.returnPct / 100, goal.stepUp),
    [goal.sipMonthly, goal.years, goal.returnPct, goal.stepUp]
  );

  const finalCorpus   = projection[projection.length - 1]?.corpus || 0;
  const finalStepUp   = stepUpProjection[stepUpProjection.length - 1]?.corpus || 0;
  const totalInvested = projection[projection.length - 1]?.invested || 0;
  const goalAchieved  = finalCorpus >= goal.corpus;

  const monthlyR  = goal.returnPct / 100 / 12;
  const months    = goal.years * 12;
  const sipNeeded = monthlyR > 0
    ? (goal.corpus * monthlyR) / ((Math.pow(1 + monthlyR, months) - 1) * (1 + monthlyR))
    : goal.corpus / months;

  const goalPct = Math.min(100, (finalCorpus / goal.corpus * 100));

  const milestones = useMemo(() =>
    projection.filter((_, i) => i % 5 === 0 || i === projection.length - 1),
    [projection]
  );

  return {
    goal, setField,
    projection, stepUpProjection,
    finalCorpus, finalStepUp, totalInvested,
    goalAchieved, sipNeeded, goalPct,
    milestones,
  };
}
