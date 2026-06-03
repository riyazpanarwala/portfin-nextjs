'use client';

import { fmtCr, fmt } from '@/lib/store';
import { WealthProjectionChart } from '@/components/charts/Charts';
import { StatCard } from '@/components/ui/SharedUI';
import { useGoalView } from '@/hooks/useGoalView';
import styles from './GoalView.module.css';

export default function GoalView() {
  const {
    goal, setField,
    projection, stepUpProjection,
    finalCorpus, finalStepUp, totalInvested,
    goalAchieved, sipNeeded, goalPct,
    milestones,
  } = useGoalView();

  const progressColor = goalAchieved
    ? 'linear-gradient(90deg, var(--green), var(--teal))'
    : 'linear-gradient(90deg, var(--accent), var(--purple))';

  return (
    <div className="fade-up">
      <div className={styles.layout}>

        {/* ── Controls ── */}
        <div className={styles.controlsCol}>

          <div className={`glass ${styles.formPanel}`}>
            <div className={styles.formPanelTitle}>Set Your Goal</div>
            <FormField label="Target Corpus (₹)"          value={goal.corpus}     onChange={setField('corpus')}     />
            <FormField label="Target Year (from now)"     value={goal.years}      onChange={setField('years')}      />
            <FormField label="Expected Annual Return (%)" value={goal.returnPct}  onChange={setField('returnPct')}  />
            <FormField label="Monthly SIP (₹)"            value={goal.sipMonthly} onChange={setField('sipMonthly')} />
          </div>

          <div className={`glass ${styles.stepUpPanel}`}>
            <div className={styles.stepUpTitle}>📈 SIP Step-Up Planner</div>
            <div className={styles.stepUpSub}>Increase your SIP by a fixed % every year</div>

            <div className={styles.stepUpSliderRow}>
              <div className={styles.stepUpSliderHeader}>
                <span className={styles.stepUpSliderLabel}>Annual Step-Up Rate</span>
                <span className={styles.stepUpSliderValue}>{goal.stepUp}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={goal.stepUp}
                onChange={e => setField('stepUp')(e.target.value)}
                className={styles.stepUpRange}
              />
              <div className={styles.stepUpScaleRow}>
                <span>0% (flat)</span><span>10% (typical)</span><span>20%</span><span>30%</span>
              </div>
            </div>

            <div className={styles.stepUpResult}>
              <div className={styles.stepUpResultLabel}>
                With {goal.stepUp}% step-up, final corpus:
              </div>
              <div className={styles.stepUpResultValue}>{fmtCr(finalStepUp)}</div>
              <div className={styles.stepUpResultSub}>
                +{fmtCr(finalStepUp - finalCorpus)} vs flat SIP ({((finalStepUp / finalCorpus - 1) * 100).toFixed(0)}% more)
              </div>
            </div>
          </div>
        </div>

        {/* ── Results ── */}
        <div className={styles.resultsCol}>

          <div className={styles.statsGrid}>
            <StatCard label="Projected Corpus" value={fmtCr(finalCorpus)}            color={goalAchieved ? 'var(--green2)' : 'var(--yellow)'} />
            <StatCard label="Goal Corpus"       value={fmtCr(goal.corpus)}            color="var(--text)" />
            <StatCard label="Total Invested"    value={fmtCr(totalInvested)}          color="var(--text2)" />
            <StatCard label="SIP Needed"        value={`₹${fmt(sipNeeded, 0)}`}       color="var(--accent2)" />
            <StatCard label="Gain from Market"  value={fmtCr(finalCorpus - totalInvested)} color="var(--green2)" />
          </div>

          <div className={`glass ${styles.progressPanel}`}>
            <div className={styles.progressHeader}>
              <span className={styles.progressTitle}>Goal Progress</span>
              <span className={styles.progressPct} style={{ color: goalAchieved ? 'var(--green2)' : 'var(--yellow)' }}>
                {goalPct.toFixed(1)}%
              </span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${goalPct}%`, background: progressColor }} />
            </div>
            <div className={styles.progressNote}>
              {goalAchieved
                ? `✅ Goal achievable! Surplus of ${fmtCr(finalCorpus - goal.corpus)}`
                : `⚠️ Shortfall of ${fmtCr(goal.corpus - finalCorpus)} — increase SIP to ₹${fmt(sipNeeded, 0)}/month`
              }
            </div>
          </div>

          <div className={`glass ${styles.chartPanel}`}>
            <div className={styles.chartTitle}>Wealth Projection</div>
            <WealthProjectionChart data={projection} stepData={stepUpProjection} goal={goal.corpus} />
          </div>

          <div className={`glass ${styles.milestonesPanel}`}>
            <div className={styles.milestonesTitle}>Milestone Tracker</div>
            <div className={styles.milestonesTableWrapper}>
              <table className={styles.milestonesTable}>
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
                  {milestones.map((d, i) => {
                    const su = stepUpProjection[d.year] || stepUpProjection[stepUpProjection.length - 1];
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>Y{d.year}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtCr(d.invested)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent2)', fontWeight: 600 }}>{fmtCr(d.corpus)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--green2)', fontWeight: 600 }}>{fmtCr(su.corpus)}</td>
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

function FormField({ label, value, onChange }) {
  return (
    <div className={styles.formField}>
      <label className={styles.formFieldLabel}>{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
