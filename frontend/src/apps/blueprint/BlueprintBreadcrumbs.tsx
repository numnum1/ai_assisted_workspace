export interface BreadcrumbEntry {
  graphId: string;
  label: string;
  containerNodeId?: string;
  parentGraphId?: string;
}

interface BlueprintBreadcrumbsProps {
  items: BreadcrumbEntry[];
  onNavigate: (index: number) => void;
}

export function BlueprintBreadcrumbs({ items, onNavigate }: BlueprintBreadcrumbsProps) {
  return (
    <div className="bp-breadcrumbs">
      {items.map((entry, i) => (
        <span className="bp-breadcrumbs__item" key={entry.graphId}>
          {i > 0 && <span className="bp-breadcrumbs__sep">›</span>}
          {i === items.length - 1 ? (
            <span className="bp-breadcrumbs__current">{entry.label}</span>
          ) : (
            <button type="button" onClick={() => onNavigate(i)}>
              {entry.label}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
