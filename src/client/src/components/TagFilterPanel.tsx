import { useMemo } from 'react';

const NAMESPACE_LABELS: Record<string, string> = {
  people: 'People',
  wars: 'Wars',
  documents: 'Documents',
  timePeriod: 'Time period',
};

// Stable display order for namespaces. Any namespace present in the data but
// not in this list is rendered after the known ones in alphabetical order so
// unexpected backend additions remain visible (rather than silently dropped).
const NAMESPACE_ORDER: readonly string[] = ['people', 'wars', 'documents', 'timePeriod'];

export interface TagFilterPanelProps {
  /** All tags present in the active option scope (post-Studied filter). */
  readonly availableTags: readonly string[];
  /** Currently-selected tags (subset of availableTags). */
  readonly selectedTags: ReadonlySet<string>;
  /** Toggle a single tag on/off. */
  readonly onToggleTag: (tag: string) => void;
  /** Clear every tag in a single namespace (e.g. all "people:*"). */
  readonly onClearNamespace: (namespace: string) => void;
}

interface TagGroup {
  readonly namespace: string;
  readonly label: string;
  readonly tags: readonly string[];
}

function groupTagsByNamespace(tags: readonly string[]): readonly TagGroup[] {
  const byNs = new Map<string, string[]>();
  for (const tag of tags) {
    const idx = tag.indexOf(':');
    if (idx <= 0) continue;
    const ns = tag.slice(0, idx);
    const list = byNs.get(ns) ?? [];
    list.push(tag);
    byNs.set(ns, list);
  }

  const seenNs = new Set(byNs.keys());
  const ordered: TagGroup[] = [];
  for (const ns of NAMESPACE_ORDER) {
    if (seenNs.has(ns)) {
      ordered.push({
        namespace: ns,
        label: NAMESPACE_LABELS[ns] ?? ns,
        tags: [...(byNs.get(ns) ?? [])].sort(),
      });
      seenNs.delete(ns);
    }
  }
  for (const ns of [...seenNs].sort()) {
    ordered.push({
      namespace: ns,
      label: NAMESPACE_LABELS[ns] ?? ns,
      tags: [...(byNs.get(ns) ?? [])].sort(),
    });
  }
  return ordered;
}

function valueOf(tag: string): string {
  const idx = tag.indexOf(':');
  return idx > 0 ? tag.slice(idx + 1) : tag;
}

export function TagFilterPanel({
  availableTags,
  selectedTags,
  onToggleTag,
  onClearNamespace,
}: TagFilterPanelProps): React.ReactNode {
  const groups = useMemo(() => groupTagsByNamespace(availableTags), [availableTags]);

  if (groups.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {groups.map(group => {
        const selectedInGroup = group.tags.filter(t => selectedTags.has(t));
        const hasSelection = selectedInGroup.length > 0;
        return (
          <div key={group.namespace} data-testid={`tag-group-${group.namespace}`}>
            <div className="flex items-center gap-2 mb-1">
              <span
                id={`tag-group-${group.namespace}-label`}
                className="text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                {group.label}
              </span>
              {hasSelection && (
                <button
                  type="button"
                  onClick={() => onClearNamespace(group.namespace)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div
              role="group"
              aria-labelledby={`tag-group-${group.namespace}-label`}
              className="flex flex-wrap gap-2"
            >
              {group.tags.map(tag => {
                const isSelected = selectedTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTag(tag)}
                    aria-pressed={isSelected}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {valueOf(tag)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
