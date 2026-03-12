import { useState, useEffect } from 'react';
import axios from 'axios';
import { ShieldCheck, AlertTriangle, FileText, Activity, Brain } from 'lucide-react';
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

function App() {
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clausesRes, violationsRes, reviewersRes, metricsRes] = await Promise.all([
          axios.get('/api/clauses'),
          axios.get('/api/violations'),
          axios.get('/api/reviewers/top'),
          axios.get('/api/metrics/org')
        ]);
        setClauses(clausesRes.data);
        setViolations(violationsRes.data);
        setReviewers(reviewersRes.data);
        setMetrics(metricsRes.data);
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
      </div>
    </div>
  );
}

export default App;
