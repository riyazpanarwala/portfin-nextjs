'use client';

import { LineChart as LineChartIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmt, fmtCr } from '@/lib/store';
import { useGoalView } from '@/hooks/useGoalView';
import styles from './GoalView.module.css';

const TICK = { fill: '#5c7a9a', fontSize: 9, fontFamily: 'var(--font-mono)' };
const GRID = 'rgba(45,64,96,0.42)';
const TOOLTIP = {
  background: '#111827',
  border: '1px solid #2d4060',
  borderRadius: 8,
  color: '#e8eef8',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
};

export default function GoalView() {
  const vm = useGoalView();
  const {
    goal,
    setField,
    currentPortfolio,
    avgMonthlySip,
    currentMonthlySip,
    stepUpBaseSip,
    yearsRemaining,
    projection,
    finalCorpus,
    goalAchieved,
    sipNeeded,
    scenarios,
    milestones,
    monteCarlo,
    stepUpData,
    stepUpChartData,
    finalStepUp,
    finalFlatStep,
    stepUpInvested,
    flatInvested,
    finalStepSip,
    stepRateScenarios,
  } = vm;

  const surplus = finalCorpus - goal.corpus;
  const stepExtra = finalStepUp - finalFlatStep;
  const stepMultiplier = finalFlatStep > 0 ? finalStepUp / finalFlatStep : 1;

  return (
    <div className={`fade-up ${styles.goalPage}`}>
      <div className={styles.kpiGrid}>
        <Metric label="Goal corpus" value={fmtCr(goal.corpus)} sub={`Target by ${goal.targetYear}`} tone="gold" />
        <Metric label="Current portfolio" value={fmtCr(currentPortfolio)} sub="As of today" tone="blue" />
        <Metric label="Years remaining" value={`${yearsRemaining}y`} sub="To target date" tone="violet" />
        <Metric label="SIP required" value={sipNeeded <= currentMonthlySip ? 'On track!' : `₹${fmt(sipNeeded, 0)}/mo`} sub={`At ${goal.returnPct}% p.a.`} tone="green" />
        <Metric label="Projected value" value={fmtCr(finalCorpus)} sub={goalAchieved ? 'Exceeds goal' : 'Below goal'} tone="slate" />
        <Metric label="Avg current SIP" value={`${fmtCr(currentMonthlySip)}/mo`} sub={avgMonthlySip ? 'From timeline active months' : 'Manual fallback'} tone="slate" />
      </div>

      <div className={styles.topGrid}>
        <Panel title="Set your goal">
          <Slider label="Target corpus" value={goal.corpus} min={2_500_000} max={50_000_000} step={500_000} onChange={setField('corpus')} display={fmtCr(goal.corpus)} />
          <Slider label="Target year" value={goal.targetYear} min={2028} max={2045} step={1} onChange={setField('targetYear')} display={goal.targetYear} />
          <Slider label="Expected annual return (%)" value={goal.returnPct} min={6} max={20} step={0.5} onChange={setField('returnPct')} display={`${goal.returnPct}%`} />
          {avgMonthlySip ? (
            <ReadOnlyField label="Monthly SIP from timeline" value={`${fmtCr(currentMonthlySip)}/mo`} />
          ) : (
            <Slider label="Monthly SIP fallback" value={goal.sipMonthly} min={0} max={200_000} step={500} onChange={setField('sipMonthly')} display={`₹${fmt(goal.sipMonthly, 0)}/mo`} />
          )}

          <div className={styles.statusBox}>
            <div>
              <span className={styles.eyebrow}>SIP needed</span>
              <strong>{sipNeeded <= currentMonthlySip ? 'Already on track!' : `₹${fmt(sipNeeded, 0)}/mo`}</strong>
            </div>
            <div>
              <span className={styles.eyebrow}>Projected at current pace</span>
              <strong className={goalAchieved ? styles.good : styles.warn}>{fmtCr(finalCorpus)}</strong>
            </div>
            <p>
              {goalAchieved
                ? `On track: your timeline avg SIP can reach ${fmtCr(finalCorpus)} by ${goal.targetYear}, a ${fmtCr(Math.abs(surplus))} surplus.`
                : `Increase SIP by ₹${fmt(Math.max(0, sipNeeded - currentMonthlySip), 0)}/mo to reach ${fmtCr(goal.corpus)} by ${goal.targetYear}.`}
            </p>
          </div>
        </Panel>

        <Panel title="Wealth projection">
          <ProjectionChart data={projection} goal={goal.corpus} />
        </Panel>
      </div>

      <Panel title="SIP scenarios - monthly amount needed to reach goal">
        <div className={styles.scenarioList}>
          {scenarios.map(s => (
            <div className={styles.scenarioRow} key={s.rate}>
              <span className={s.rate === goal.returnPct ? styles.currentScenarioRate : ''}>
                {s.rate}% p.a.{s.rate === goal.returnPct ? ' ◄' : ''}
              </span>
              <strong className={`${styles.scenarioAmount} ${s.onTrack ? styles.good : ''}`}>
                {s.onTrack ? 'On track!' : `₹${fmt(s.extraSipNeeded, 0)}/mo`}
                <small>{s.onTrack ? `Needs ₹${fmt(s.needed, 0)}/mo` : `Total ₹${fmt(s.needed, 0)}/mo`}</small>
              </strong>
              <div className={styles.scenarioTrack}>
                <i style={{ width: `${s.progressPct}%` }} />
              </div>
              <em>{s.onTrack ? fmtCr(s.finalCorpus) : `vs avg ₹${fmt(s.baselineSip, 0)}`}</em>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Milestone tracker">
        <div className={styles.milestoneList}>
          {milestones.map(m => (
            <div className={styles.milestoneRow} key={m.pct}>
              <span className={m.reached ? styles.dotGreen : m.year ? styles.dotGold : styles.dotMuted} />
              <strong>{Math.round(m.pct * 100)}%</strong>
              <b>{fmtCr(m.amount)}</b>
              <em className={m.reached ? styles.reachedText : ''}>{m.reached ? '✓ Reached' : m.year ? `Est. ${m.year}` : 'Beyond horizon'}</em>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Monte Carlo SIP simulator" meta="500 randomised market paths - P10 / P50 / P90 corridors">
        <div className={styles.mcStats}>
          <MiniStat label="Probability of reaching goal" value={`${monteCarlo.probability}%`} tone="green" />
          <MiniStat label="Median projected value" value={fmtCr(monteCarlo.median)} tone="gold" />
          <MiniStat label="Pessimistic (P10)" value={fmtCr(monteCarlo.pessimistic)} tone="red" />
          <MiniStat label="Optimistic (P90)" value={fmtCr(monteCarlo.optimistic)} tone="green" />
        </div>
        <MonteCarloChart data={monteCarlo.paths} />
        <p className={styles.note}>
          Each path simulates monthly SIP investing with a deterministic probability corridor. Green bands show upside ranges, red bands show lower outcomes, and the dashed red line is your goal corpus.
        </p>
      </Panel>

      <section className={styles.stepHeader}>
        <LineChartIcon size={20} />
        <div>
          <h2>SIP Step-Up Planner</h2>
          <p>Model the impact of increasing your SIP by a fixed percentage every year.</p>
        </div>
      </section>

      <div className={styles.kpiGrid}>
        <Metric label="Flat SIP corpus" value={fmtCr(finalFlatStep)} sub={fmtCr(flatInvested) + ' invested'} tone="slate" />
        <Metric label="Step-up corpus" value={fmtCr(finalStepUp)} sub={fmtCr(stepUpInvested) + ' invested'} tone="gold" />
        <Metric label="Extra wealth" value={fmtCr(stepExtra)} sub="By stepping up vs flat" tone="green" />
        <Metric label="Final monthly SIP" value={`₹${fmt(finalStepSip, 0)}/mo`} sub={`After ${goal.stepUpYears}y of step-ups`} tone="blue" />
        <Metric label="With your portfolio" value={fmtCr(currentPortfolio + finalStepUp)} sub="Step-up SIP + current FV" tone="violet" />
        <Metric label="Step-up multiplier" value={`${stepMultiplier.toFixed(2)}x`} sub="Vs flat SIP outcome" tone="orange" />
      </div>

      <div className={styles.topGrid}>
        <Panel title="Configure step-up">
          {avgMonthlySip ? (
            <ReadOnlyField label="Starting monthly SIP from timeline" value={`${fmtCr(stepUpBaseSip)}/mo`} />
          ) : (
            <Slider label="Starting monthly SIP fallback" value={goal.stepUpSip} min={1_000} max={100_000} step={500} onChange={setField('stepUpSip')} display={`₹${fmt(goal.stepUpSip, 0)}/mo`} />
          )}
          <Slider label="Annual step-up rate" value={goal.stepUpPct} min={0} max={30} step={1} onChange={setField('stepUpPct')} display={`+${goal.stepUpPct}% / yr`} />
          <Slider label="Expected return p.a." value={goal.stepUpReturnPct} min={6} max={20} step={0.5} onChange={setField('stepUpReturnPct')} display={`${goal.stepUpReturnPct}% p.a.`} />
          <Slider label="Investment horizon" value={goal.stepUpYears} min={5} max={30} step={1} onChange={setField('stepUpYears')} display={`${goal.stepUpYears} yrs`} />

          <div className={styles.stepInsight}>
            <div>
              <span className={styles.eyebrow}>What stepping up does for you</span>
              <p>
                By increasing your SIP by <strong>+{goal.stepUpPct}% every year</strong>, you accumulate <strong>{fmtCr(stepExtra)} more wealth</strong> than a flat SIP, while your deployable amount grows with income.
              </p>
            </div>
            <MiniStat label="Extra gains" value={fmtCr(stepExtra - (stepUpInvested - flatInvested))} tone="green" />
          </div>
        </Panel>

        <Panel title="Corpus growth - flat vs step-up">
          <StepUpLineChart data={stepUpChartData} />
        </Panel>
      </div>

      <div className={styles.topGrid}>
        <Panel title="Monthly SIP over time" meta="Step-up vs flat - see how the burden grows">
          <SipBarChart data={stepUpData} flat={stepUpBaseSip} />
        </Panel>

        <Panel title="Step-up rate scenarios" meta="Final corpus comparison">
          <div className={styles.rateList}>
            {stepRateScenarios.map(row => (
              <div className={styles.rateRow} key={row.rate}>
                <span>{row.rate === 0 ? 'Flat' : `+${row.rate}% / yr`}</span>
                <strong>{fmtCr(row.corpus)}</strong>
                <div className={styles.scenarioTrack}>
                  <i style={{ width: `${Math.min(100, (row.corpus / stepRateScenarios.at(-1).corpus) * 100)}%` }} />
                </div>
                <em>{row.multiplier.toFixed(2)}x - Final SIP ₹{fmt(row.finalSip, 0)}/mo</em>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="SIP escalation schedule" meta="Your SIP amount, cumulative investment, and projected corpus at each milestone year">
        <div className={styles.tableWrap}>
          <table className={styles.scheduleTable}>
            <thead>
              <tr>
                <th>Year</th>
                <th>Monthly SIP</th>
                <th>Annual deploy</th>
                <th>Cum. invested</th>
                <th>Corpus value</th>
                <th>Total gain</th>
                <th>Gain %</th>
              </tr>
            </thead>
            <tbody>
              {stepUpData.filter((_, i) => i < 10 || i === stepUpData.length - 1).map(row => (
                <tr key={row.year}>
                  <td>Year {row.year}</td>
                  <td>₹{fmt(row.sip, 0)}/mo</td>
                  <td>{fmtCr(row.annualDeploy)}/yr</td>
                  <td>{fmtCr(row.invested)}</td>
                  <td>{fmtCr(row.corpus)}</td>
                  <td className={styles.good}>{fmtCr(row.gain)}</td>
                  <td className={styles.good}>{row.invested ? fmt((row.gain / row.invested) * 100, 1) : '0'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, meta, children }) {
  return (
    <section className={`glass ${styles.panel}`}>
      <div className={styles.panelHeader}>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, sub, tone }) {
  return (
    <div className={`${styles.metric} ${styles[tone] || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{sub}</em>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div className={`${styles.miniStat} ${styles[tone] || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, display }) {
  return (
    <label className={styles.sliderField}>
      <span>{label}</span>
      <b>{display}</b>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className={styles.readOnlyField}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function yFmt(v) {
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
  return `₹${(v / 1e5).toFixed(0)} L`;
}

function ProjectionChart({ data, goal }) {
  const chartData = data.map(d => ({ ...d, goal }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="goal-current-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={yFmt} tick={TICK} axisLine={false} tickLine={false} width={62} />
        <Tooltip formatter={v => yFmt(v)} contentStyle={TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Line type="monotone" dataKey="goal" name="Goal" stroke="#ef4444" strokeDasharray="6 4" dot={false} />
        <Area type="monotone" dataKey="corpus" name="Current pace" stroke="#60a5fa" strokeWidth={2.5} fill="url(#goal-current-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MonteCarloChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={yFmt} tick={TICK} axisLine={false} tickLine={false} width={62} />
        <Tooltip formatter={v => yFmt(v)} contentStyle={TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Area type="monotone" dataKey="p90" name="P90" stroke="#22c55e" fill="#22c55e" fillOpacity={0.08} dot={false} />
        <Area type="monotone" dataKey="p75" name="P75" stroke="#16a34a" fill="#16a34a" fillOpacity={0.12} dot={false} />
        <Line type="monotone" dataKey="median" name="Median" stroke="#22c55e" strokeWidth={2.4} dot={false} />
        <Line type="monotone" dataKey="currentPace" name="Avg SIP projection" stroke="#60a5fa" strokeDasharray="5 4" dot={false} />
        <Line type="monotone" dataKey="p10" name="P10" stroke="#ef4444" strokeDasharray="3 3" dot={false} />
        <Line type="monotone" dataKey="goal" name="Goal" stroke="#ef4444" strokeDasharray="7 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function StepUpLineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={yFmt} tick={TICK} axisLine={false} tickLine={false} width={62} />
        <Tooltip formatter={v => yFmt(v)} contentStyle={TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Line type="monotone" dataKey="corpus" name="Step-up SIP corpus" stroke="#f59e0b" strokeWidth={2.4} dot={false} />
        <Line type="monotone" dataKey="flatCorpus" name="Flat SIP corpus" stroke="#60a5fa" strokeDasharray="5 4" dot={false} />
        <Line type="monotone" dataKey="currentPortfolio" name="Step-up + current portfolio" stroke="#22c55e" strokeDasharray="3 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SipBarChart({ data, flat }) {
  const chartData = data.map(d => ({ ...d, flat }));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => `₹${fmt(v, 0)}`} tick={TICK} axisLine={false} tickLine={false} width={70} />
        <Tooltip formatter={v => `₹${fmt(v, 0)}/mo`} contentStyle={TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a9c4' }} />
        <Bar dataKey="sip" name="Monthly SIP (step-up)" fill="#d6a635" radius={[4, 4, 0, 0]} />
        <Bar dataKey="flat" name="Monthly SIP (flat)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
