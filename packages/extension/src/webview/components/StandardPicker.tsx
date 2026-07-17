import { cn } from '@/lib/utils';
import { postMessage } from '@/lib/bridge';
import type { StandardPickerState, StandardProfileVM } from '@/lib/types';

function apply(id: string): void {
  postMessage({ type: 'select', id });
}

function ruleLabel(rule: string): string {
  switch (rule) {
    case 'ac-testable': return 'ACs testable';
    case 'ac-has-test': return 'AC → test';
    case 'tc-has-result': return 'test → result';
    case 'rtm-no-dangling': return 'RTM intact';
    case 'mandatory-sections': return 'required sections';
    default: return rule;
  }
}

function ProfileCard({ p, current }: { p: StandardProfileVM; current: boolean }) {
  return (
    <button
      type="button"
      onClick={() => apply(p.id)}
      aria-pressed={current}
      className={cn(
        'group relative flex w-full flex-col gap-3 rounded-lg border p-4 text-left transition',
        'hover:border-primary/60 hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        current ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'border-border bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{p.name}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{p.id}</code>
        </div>
        {current && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary border border-primary/30">
            ✓ CURRENT
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{p.description}</p>

      {p.anchors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.anchors.map(([phase, name]) => (
            <span
              key={phase}
              className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={`${phase}: ${name}`}
            >
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {p.enforce ? (
          p.rules.map((r) => (
            <span
              key={r}
              className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success border border-success/30"
            >
              {ruleLabel(r)}
            </span>
          ))
        ) : (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border">
            no enforcement
          </span>
        )}
      </div>
    </button>
  );
}

export function StandardPicker({ state }: { state: StandardPickerState | null }) {
  if (!state) {
    return <div className="p-6 text-sm text-muted-foreground">Loading profiles…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">SDLC Compliance Standard</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          One selector over three coupled layers — enforced artifact sections, traceability validator
          rules, and per-phase persona/skill. Click a profile to apply it to this workspace.
          <code className="mx-1 rounded bg-muted px-1 py-0.5">none</code>
          keeps today’s behavior (nothing enforced).
        </p>
      </header>

      {state.justApplied && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          Saved — <code className="font-semibold">standard: {state.justApplied}</code> written to
          <code className="mx-1">.aidlc/workspace.yaml</code>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {state.profiles.map((p) => (
          <ProfileCard key={p.id} p={p} current={p.id === state.current} />
        ))}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
        Applies to new phase runs. Per-epic overrides and hand-edits to
        <code className="mx-1">.aidlc/workspace.yaml</code> are honored too; an unknown value is
        rejected when the workspace loads.
      </p>
    </div>
  );
}
