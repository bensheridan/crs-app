import { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, AlertTriangle, FileText, Activity, Brain, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import './index.css';

interface Clause {
  id: number;
  title: string;
  category: string;
  violation_count: number;
  last_violated_at: string;
  confidence_score: number;
}

interface Violation {
  id: number;
  clause_id: number;
  pr_number: number;
  reviewer: string;
  timestamp: string;
  clause: Clause;
}

interface Reviewer {
  id: string;
  github_id: string;
  constitution_score: number;
  agreed_with_ai: number;
  overrode_ai: number;
}

interface Metric {
  id: string;
  name: string;
  value: number;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  suggestion_count: number;
  source_prs: number[];
  status: string;
}

interface DebateRound {
  id: string;
  round_number: number;
  primary_argument: string;
  devil_rebuttal: string;
  score: number;
  strength_label: string;
  constitutional_references: string[];
  evidence_citations: string[];
  coherence_rating: number;
}

interface DebateRecord {
  id: string;
  pr_number: number;
  repo_owner: string;
  repo_name: string;
  debate_confidence: number;
  confidence_label: string;
  total_rounds: number;
  max_rounds: number;
  terminated_early: boolean;
  created_at: string;
  transcript?: string;
  rounds?: DebateRound[];
}

interface DebateMetrics {
  averageConfidence: number;
  totalDebates: number;
}

function App() {
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [debates, setDebates] = useState<DebateRecord[]>([]);
  const [debateMetrics, setDebateMetrics] = useState<DebateMetrics>({ averageConfidence: 0, totalDebates: 0 });
  const [selectedDebate, setSelectedDebate] = useState<DebateRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clausesRes, violationsRes, reviewersRes, metricsRes, proposalsRes, debatesRes, debateMetricsRes] = await Promise.all([
          axios.get('/api/clauses'),
          axios.get('/api/violations'),
          axios.get('/api/reviewers/top'),
          axios.get('/api/metrics/org'),
          axios.get('/api/proposals?status=pending'),
          axios.get('/api/debates'),
          axios.get('/api/debates/metrics')
        ]);
        setClauses(clausesRes.data);
        setViolations(violationsRes.data);
        setReviewers(reviewersRes.data);
        setMetrics(metricsRes.data);
        setProposals(proposalsRes.data);
        setDebates(debatesRes.data);
        setDebateMetrics(debateMetricsRes.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <h2 style={{ color: 'var(--accent-color)' }}>Loading Constitution Metrics...</h2>
      </div>
    );
  }

  const totalViolations = clauses.reduce((acc, c) => acc + c.violation_count, 0);
  const activeClauses = clauses.length;
  const avgConfidence = activeClauses > 0
    ? Math.round(clauses.reduce((acc, c) => acc + (c.confidence_score || 0), 0) / activeClauses)
    : 0;

  const totalAdopted = metrics.find(m => m.name === 'total_clauses_adopted')?.value || 0;
  const totalRejected = metrics.find(m => m.name === 'total_clauses_rejected')?.value || 0;

  // Format data for Recharts
  const topClausesData = clauses.slice(0, 5).map(c => ({
    name: c.title.length > 20 ? c.title.substring(0, 20) + '...' : c.title,
    violations: c.violation_count
  }));

  // Create a simple timeline of violations over the last 10 records
  const timelineData = [...violations].reverse().slice(0, 20).map((v, i) => ({
    name: `PR #${v.pr_number}`,
    count: i + 1 // Just a simple cumulative proxy for now
  }));

  const handleSelectDebate = async (debate: DebateRecord) => {
    if (selectedDebate?.id === debate.id) {
      setSelectedDebate(null);
      return;
    }
    try {
      const res = await axios.get(`/api/debates/${debate.id}`);
      setSelectedDebate(res.data);
    } catch (error) {
      console.error('Failed to fetch debate details:', error);
    }
  };

  const confidenceLabelColor = (label: string) => {
    switch (label) {
      case 'high': return 'var(--text-secondary)';
      case 'moderate': return 'var(--accent-color)';
      case 'low': return 'var(--danger-color)';
      default: return 'var(--text-primary)';
    }
  };

  return (
    <div className="dashboard-container">
      <h1>Constitution Analytics Dashboard</h1>
      <p className="subtitle">Real-time governance metrics and AI reviewer performance</p>

      <div className="grid">
        <div className="card">
          <div className="card-title">
            <ShieldCheck color="var(--text-secondary)" size={24} />
            Total Clauses Enforced
          </div>
          <div className="stat-value">{activeClauses}</div>
        </div>

        <div className="card">
          <div className="card-title">
            <AlertTriangle color="var(--danger-color)" size={24} />
            Total Violations Caught
          </div>
          <div className="stat-value">{totalViolations}</div>
        </div>

        <div className="card">
          <div className="card-title">
            <Brain color="var(--accent-hover)" size={24} />
            Avg AI Confidence
          </div>
          <div className="stat-value">{avgConfidence}/100</div>
        </div>

        <div className="card">
          <div className="card-title">
            <ShieldCheck color="var(--accent-hover)" size={24} />
            Clauses Adopted
          </div>
          <div className="stat-value">{totalAdopted}</div>
        </div>

        <div className="card">
          <div className="card-title">
            <AlertTriangle color="var(--danger-color)" size={24} />
            Clauses Rejected
          </div>
          <div className="stat-value">{totalRejected}</div>
        </div>

        <div className="card">
          <div className="card-title">
            <Brain color="var(--accent-color)" size={24} />
            Avg Debate Confidence
          </div>
          <div className="stat-value">{debateMetrics.averageConfidence}/100</div>
        </div>

        <div className="card">
          <div className="card-title">
            <MessageSquare color="var(--accent-hover)" size={24} />
            Total Debates
          </div>
          <div className="stat-value">{debateMetrics.totalDebates}</div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">
            <Activity color="var(--accent-color)" size={24} />
            Most Violated Clauses
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topClausesData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-primary)" tick={{ fill: 'var(--text-primary)' }} />
                <YAxis stroke="var(--text-primary)" tick={{ fill: 'var(--text-primary)' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--accent-color)' }}
                />
                <Bar dataKey="violations" fill="var(--accent-hover)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <FileText color="var(--accent-color)" size={24} />
            Recent PR Violations
          </div>
          <ul className="violation-list">
            {violations.slice(0, 5).map(v => (
              <li key={v.id} className="violation-item">
                <div>
                  <div className="clause-name">{v.clause?.title || 'Unknown Clause'}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    PR #{v.pr_number} • {new Date(v.timestamp).toLocaleDateString()}
                  </div>
                </div>
                <div className="clause-count">1</div>
              </li>
            ))}
            {violations.length === 0 && (
              <li style={{ color: 'var(--text-secondary)' }}>No recent violations recorded.</li>
            )}
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <Activity color="var(--danger-color)" size={24} />
            Violation Incidence Timeline
          </div>
          <div className="chart-container" style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-primary)" tick={{ fill: 'var(--text-primary)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
                <Line type="monotone" dataKey="count" stroke="var(--danger-color)" strokeWidth={3} dot={{ fill: 'var(--danger-color)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <ShieldCheck color="var(--accent-color)" size={24} />
            Top Reviewers (Leaderboard)
          </div>
          <ul className="violation-list">
            {reviewers.map((r, i) => (
              <li key={r.id} className="violation-item">
                <div>
                  <div className="clause-name" style={{ color: i === 0 ? 'gold' : 'inherit' }}>
                    #{i + 1} {r.github_id}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Agreed: {r.agreed_with_ai} | Overrode: {r.overrode_ai}
                  </div>
                </div>
                <div className="clause-count">{r.constitution_score} pts</div>
              </li>
            ))}
            {reviewers.length === 0 && (
              <li style={{ color: 'var(--text-secondary)' }}>No reviewers have interacted yet.</li>
            )}
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <FileText color="var(--accent-hover)" size={24} />
            Pending Clause Proposals
          </div>
          <ul className="violation-list">
            {proposals.map(p => (
              <li key={p.id} className="violation-item">
                <div>
                  <div className="clause-name">{p.title}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {p.description.length > 80 ? p.description.substring(0, 80) + '...' : p.description}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Source PRs: {p.source_prs.map(pr => `#${pr}`).join(', ')}
                  </div>
                </div>
                <div className="clause-count">{p.suggestion_count}x</div>
              </li>
            ))}
            {proposals.length === 0 && (
              <li style={{ color: 'var(--text-secondary)' }}>No pending proposals.</li>
            )}
          </ul>
        </div>

        <div className="card">
          <div className="card-title">
            <Activity color="var(--text-secondary)" size={24} />
            Org Global Metrics
          </div>
          <ul className="violation-list">
            {metrics.map(m => (
              <li key={m.id} className="violation-item">
                <div className="clause-name" style={{ textTransform: 'capitalize' }}>{m.name.replace(/_/g, ' ')}</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{m.value}</div>
              </li>
            ))}
            {metrics.length === 0 && (
              <li style={{ color: 'var(--text-secondary)' }}>No org metrics recorded yet.</li>
            )}
          </ul>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">
            <Brain color="var(--accent-color)" size={24} />
            Recent Debates
          </div>
          <ul className="violation-list">
            {debates.slice(0, 10).map(d => (
              <li key={d.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <div
                  className="violation-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSelectDebate(d)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {selectedDebate?.id === d.id
                      ? <ChevronDown size={16} color="var(--accent-color)" />
                      : <ChevronRight size={16} color="var(--text-secondary)" />
                    }
                    <div>
                      <div className="clause-name">PR #{d.pr_number}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        {d.total_rounds}/{d.max_rounds} rounds
                        {d.terminated_early && ' (consensus)'}
                        {' • '}
                        {new Date(d.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: confidenceLabelColor(d.confidence_label), textTransform: 'uppercase', fontWeight: 600 }}>
                      {d.confidence_label}
                    </span>
                    <div className="clause-count">{d.debate_confidence}</div>
                  </div>
                </div>
                {selectedDebate?.id === d.id && selectedDebate.rounds && (
                  <div style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
                    {selectedDebate.rounds.map(r => (
                      <div key={r.id} style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>Round {r.round_number}</span>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: r.strength_label === 'strong' ? 'var(--text-secondary)' : 'var(--danger-color)', textTransform: 'uppercase', fontWeight: 600 }}>
                              {r.strength_label}
                            </span>
                            <span className="clause-count">{r.score}</span>
                          </div>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--accent-hover)', fontWeight: 600, marginBottom: '0.25rem' }}>Primary Argument</div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                            {r.primary_argument.length > 300 ? r.primary_argument.substring(0, 300) + '...' : r.primary_argument}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--danger-color)', fontWeight: 600, marginBottom: '0.25rem' }}>Devil&apos;s Rebuttal</div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                            {r.devil_rebuttal.length > 300 ? r.devil_rebuttal.substring(0, 300) + '...' : r.devil_rebuttal}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {debates.length === 0 && (
              <li style={{ color: 'var(--text-secondary)' }}>No debates recorded yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
