import { useState, useEffect, useRef } from 'react';
import { KeyRound, X, Loader } from 'lucide-react';
import { gitApi } from '../api.ts';

interface GitCredentialsDialogProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function GitCredentialsDialog({ onSuccess, onCancel }: GitCredentialsDialogProps) {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => usernameRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleSubmit = async () => {
    if (!token.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await gitApi.setCredentials(username.trim(), token.trim());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
  };

  return (
    <div className="git-creds-overlay" onClick={onCancel}>
      <div className="git-creds-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="git-creds-header">
          <KeyRound size={15} className="git-creds-icon" />
          <span className="git-creds-title">Git Authentication Required</span>
          <button className="git-creds-close" onClick={onCancel} title="Cancel" disabled={saving}>
            <X size={15} />
          </button>
        </div>

        <div className="git-creds-body">
          <p className="git-creds-hint">
            Authentication failed. Enter your credentials to continue.
            For GitHub, use a{' '}
            <strong>Personal Access Token</strong> (not your password) —
            GitHub → Settings → Developer Settings → Personal Access Tokens.
          </p>

          <label className="git-creds-label">Username</label>
          <input
            ref={usernameRef}
            className="git-creds-input"
            type="text"
            placeholder="your-github-username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(null); }}
            disabled={saving}
            autoComplete="username"
          />

          <label className="git-creds-label">Personal Access Token</label>
          <input
            className="git-creds-input"
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(null); }}
            disabled={saving}
            autoComplete="current-password"
          />

          {error && <div className="git-creds-error">{error}</div>}
        </div>

        <div className="git-creds-footer">
          <button className="git-creds-cancel" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="git-creds-submit"
            onClick={handleSubmit}
            disabled={!token.trim() || saving}
          >
            {saving ? <Loader size={13} className="git-creds-spinner" /> : <KeyRound size={13} />}
            Save & Retry
          </button>
        </div>
      </div>
    </div>
  );
}
