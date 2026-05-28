import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText } from 'lucide-react';
import { parseArtifactFromRaw } from './artifactUtils.ts';

interface ArtifactCardProps {
  raw: string;
}

export function ArtifactCard({ raw }: ArtifactCardProps) {
  const artifact = useMemo(() => parseArtifactFromRaw(raw), [raw]);

  return (
    <div className="artifact-card">
      <div className="artifact-card-header">
        <FileText size={13} aria-hidden />
        <span className="artifact-card-title">{artifact.title}</span>
      </div>
      {artifact.content ? (
        <div className="artifact-card-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {artifact.content}
          </ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
