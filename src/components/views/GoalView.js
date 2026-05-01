'use client';

import { useState, useMemo } from 'react';
import { projectWealth, fmtCr, fmt } from '@/lib/store';
import { WealthProjectionChart } from '@/components/charts/Charts';

export default function GoalView() {
  const [goal, setGoal] = useState({ corpus: 10000000, years: 20, returnPct: 12, sipMonthly: 25000, stepUp: 10 });

  const projection       = useMemo(() => projectWealth(goal.sipMonthly, goal.years, goal.returnPct / 100, 0),        [goal]);
  const stepUpProjection = useMemo(() => projectWealth(goal.sipMonthly, goal.years, goal.returnPct / 100, goal.stepUp), [goal]);

  const finalCorpus  = projection[projection.length - 1]?.corpus || 0;
  const finalStepUp  = stepUpProjection[stepUpProjection.length - 1]?.corpus || 0;
  const totalInvested = projection[projection.length - 1]?.invested || 0;

  const monthlyR = goal.returnPct / 100 / 12;
  const months   = goal.years * 12;
  const sipNeeded = monthlyR > 0
    ? (goal.corpus * monthlyR) / ((Math.pow(1 + monthlyR, months) - 1) * (1 + monthlyR))
    : goal.corpus / months;

  const goalAchieved = finalCorpus >= goal.corpus;

  return (
    <div className="fade-up">
      <div className="grid-sidebar-main" style={{ gap: '16px' }}>
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="glass" style={{ padding: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Set Your Goal</div>
            <FormField label="Target Corpus (₹)"          value={goal.corpus}     onChange={v => setGoal(g => ({ ...g, corpus:     +v }))} type="number" />
            <FormField label="Target Year (from now)"     value={goal.years}      onChange={v => setGoal(g => ({ ...g, years:      +v }))} type="number" />
            <FormField label="Expected Annual Return (%)" value={goal.returnPct}  onChange={v => setGoal(g => ({ ...g, returnPct:  +v }))} type="number" />
            <FormField label="Monthly SIP (₹)"            value={goal.sipMonthly} onChange={v => setGoal(g => ({ ...g, sipMonthly: +v }))} type="number" />
          </div>

          {/* Step-up planner */}
          <div className="glass" style={{ padding: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>📈 SIP Step-Up Planner</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>Increase your SIP by a fixed % every year</div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text2)' }}>Annual Step-Up Rate</label>
                <span style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: 'var(--accent2)' }}>{goal.stepUp}%</span>
              </div>
              <input type="range" min="0" max="30" value={goal.stepUp}
                onChange={e => setGoal(g => ({ ...g, stepUp: +e.target.value }))}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3)' }}>
                <span>0% (flat)</span><span>10% (typical)</span><span>20%</span><span>30%</span>
              </div>
            </div>
            <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>With {goal.stepUp}% step-up, final corpus:</div>
              <div style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>{fmtCr(finalStepUp)}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                +{fmtCr(finalStepUp - finalCorpus)} vs flat SIP ({((finalStepUp / finalCorpus - 1) * 100).toFixed(0)}% more)
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Key numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Projected Corpus',  value: fmtCr(finalCorpus),               color: goalAchieved ? 'var(--green2)' : 'var(--yellow)' },
              { label: 'Goal Corpus',       value: fmtCr(goal.corpus),               color: 'var(--text)' },
              { label: 'Total Invested',    value: fmtCr(totalInvested),             color: 'var(--text2)' },
              { label: 'SIP Needed',        value: `₹${fmt(sipNeeded, 0)}`,          color: 'var(--accent2)' },
              { label: 'Gain from Market',  value: fmtCr(finalCorpus - totalInvested), color: 'var(--green2)' },
            ].map((m, i) => (
              <div key={i} className="metric-card">
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>{m.label}</div>
                <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Goal progress */}
          <div className="glass" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Goal Progress</span>
              <span style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: goalAchieved ? 'var(--green2)' : 'var(--yellow)' }}>
                {Math.min(100, (finalCorpus / goal.corpus * 100)).toFixed(1)}%
              </span>
            </div>
            <div style={{ height: '12px', background: 'var(--bg3)', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{
                height: '100%',
                width: Math.min(100, (finalCorpus / goal.corpus * 100)) + '%',
                background: goalAchieved ? 'linear-gradient(90deg, var(--green), var(--teal))' : 'linear-gradient(90deg, var(--accent), var(--purple))',
                borderRadius: '6px',
                transition: 'width 0.6s ease',
              }} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {goalAchieved
                ? `✅ Goal achievable! Surplus of ${fmtCr(finalCorpus - goal.corpus)}`
                : `⚠️ Shortfall of ${fmtCr(goal.corpus - finalCorpus)} — increase SIP to ₹${fmt(sipNeeded, 0)}/month`
              }
            </div>
          </div>

          {/* Wealth projection chart */}
          <div className="glass" style={{ padding: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Wealth Projection</div>
            <WealthProjectionChart data={projection} stepData={stepUpProjection} goal={goal.corpus} />
          </div>

          {/* Milestone table */}
          <div className="glass" style={{ padding: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '14px' }}>Milestone Tracker</div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Total Invested</th>
                    <th>Flat SIP Corpus</th>
                    <th>Step-Up Corpus</th>
                    <th>Market Gain (Flat)</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.filter((_, i) => i % 5 === 0 || i === projection.length - 1).map((d, i) => {
                    const su = stepUpProjection[d.year] || stepUpProjection[stepUpProjection.length - 1];
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600' }}>Y{d.year}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtCr(d.invested)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)', fontWeight: '600' }}>{fmtCr(d.corpus)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green2)', fontWeight: '600' }}>{fmtCr(su.corpus)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green2)' }}>{fmtCr(d.corpus - d.invested)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</label>
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
