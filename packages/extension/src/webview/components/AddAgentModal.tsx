import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssetScope, SkillSummary, SkillTemplateRef } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';
import { AddSkillModal, type AddSkillDraft } from './AddSkillModal';
import { postMessage } from '@/lib/bridge';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const CAP_PATTERN = /^[a-z][a-z0-9-]*$/;

const MODELS = [
  { value: 'claude-sonnet-5', label: 'claude-sonnet-5', hint: 'Balanced (recommended default)' },
  { value: 'claude-opus-4-8', label: 'claude-opus-4-8', hint: 'Most capable, slower' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5', hint: 'Fastest, cheapest' },
];

const KNOWN_CAPABILITIES = [
  { id: 'jira', label: 'Jira', hint: 'Read Jira issues + projects' },
  { id: 'figma', label: 'Figma', hint: 'Read Figma files + designs' },
  { id: 'core-business', label: 'Core docs', hint: "Read project's core business docs" },
  { id: 'its', label: 'ITS', hint: "Read project's test cases / integrated test system folder" },
  { id: 'github', label: 'GitHub', hint: 'Read repos / PRs / issues' },
  { id: 'slack', label: 'Slack', hint: 'Read Slack channels / threads' },
  { id: 'files', label: 'Files', hint: 'Read project files (per-run glob)' },
  { id: 'web', label: 'Web', hint: 'Web search / fetch URLs' },
];

export interface AddAgentDraft {
  scope: AssetScope;
  id: string;
  name: string;
  skills: string[];
  model: string;
  description?: string;
  capabilities?: string[];
  /** aidlc only — file-based agents don't have an env concept. */
  env?: Record<string, string>;
}

interface Props {
  /** ids already taken across all scopes — duplicates blocked. */
  takenIds: string[];
  /** Available skills. Picker mirrors the Skills tab (project + global). */
  skills: SkillSummary[];
  /** Skill templates surfaced when the user opens the inline AddSkillModal. */
  skillTemplates?: SkillTemplateRef[];
  /** Skill ids already taken — forwarded to the inline AddSkillModal. */
  takenSkillIds?: string[];
  onSubmit: (draft: AddAgentDraft) => void;
  onClose: () => void;
}

const SCOPE_OPTIONS: Array<{ value: AssetScope; label: string; hint: string }> = [
  { value: 'project', label: 'project', hint: '.claude/agents/{id}.md (file only)' },
  { value: 'global', label: 'global', hint: '~/.claude/agents/{id}.md (file only)' },
];

export function AddAgentModal({
  takenIds,
  skills,
  skillTemplates,
  takenSkillIds,
  onSubmit,
  onClose,
}: Props) {
  const [scope, setScope] = useState<AssetScope>('project');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [pickedSkills, setPickedSkills] = useState<string[]>([]);
  const [model, setModel] = useState(MODELS[0].value);
  const [envRows, setEnvRows] = useState<Array<{ key: string; value: string }>>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [customCapInput, setCustomCapInput] = useState('');
  const [description, setDescription] = useState('');
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idInputRef.current?.focus();
  }, []);

  // Auto-derive display name from id when name hasn't been edited.
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => {
    if (!nameTouched) {
      setName(id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }, [id, nameTouched]);

  // Match the Skills tab — project + global only, split into tabs so the
  // user picks from one origin at a time instead of scrolling a flat list.
  // AIDLC-scope skills (workspace.yaml-declared pipeline phases) are an
  // internal binding, not user-pickable reusable assets.
  const projectSkills = useMemo(
    () => skills.filter((s) => s.scope === 'project'),
    [skills],
  );
  const globalSkills = useMemo(
    () => skills.filter((s) => s.scope === 'global'),
    [skills],
  );
  const pickableSkills = useMemo(
    () => [...projectSkills, ...globalSkills],
    [projectSkills, globalSkills],
  );
  const [skillScope, setSkillScope] = useState<'project' | 'global'>(
    projectSkills.length > 0 ? 'project' : 'global',
  );
  const scopedSkills = skillScope === 'project' ? projectSkills : globalSkills;

  const trimmedId = id.trim();
  const idError = useMemo(() => {
    if (!trimmedId) { return 'Agent id is required'; }
    if (!ID_PATTERN.test(trimmedId)) {
      return 'Lowercase letters / digits / dashes only — must start with a letter';
    }
    if (takenIds.includes(trimmedId)) {
      return `Agent "${trimmedId}" already exists`;
    }
    return null;
  }, [trimmedId, takenIds]);

  const nameError = !name.trim() ? 'Display name is required' : null;
  const envError = envRows.find((r) => r.key.trim() && !ENV_KEY_PATTERN.test(r.key.trim()))
    ? 'Env keys must be UPPERCASE with underscores'
    : null;

  const error = idError || nameError || envError;

  const submit = () => {
    if (error) { return; }
    const cleanedEnv: Record<string, string> = {};
    for (const r of envRows) {
      const k = r.key.trim();
      if (k) { cleanedEnv[k] = r.value; }
    }
    const draft: AddAgentDraft = {
      scope,
      id: trimmedId,
      name: name.trim(),
      skills: pickedSkills,
      model,
    };
    if (description.trim()) { draft.description = description.trim(); }
    if (capabilities.length > 0) { draft.capabilities = capabilities; }
    // Env vars only apply to AIDLC scope (workspace.yaml-managed).
    // File-based project/global agents have no env concept.
    if (scope === 'aidlc' && Object.keys(cleanedEnv).length > 0) {
      draft.env = cleanedEnv;
    }
    onSubmit(draft);
    onClose();
  };

  const toggleSkill = (skillId: string) => {
    setPickedSkills((cur) =>
      cur.includes(skillId) ? cur.filter((x) => x !== skillId) : [...cur, skillId],
    );
  };
  const toggleCap = (capId: string) => {
    setCapabilities((cur) =>
      cur.includes(capId) ? cur.filter((x) => x !== capId) : [...cur, capId],
    );
  };
  const addCustomCap = () => {
    const t = customCapInput.trim();
    if (!t || !CAP_PATTERN.test(t) || capabilities.includes(t)) { return; }
    setCapabilities((cur) => [...cur, t]);
    setCustomCapInput('');
  };

  return (
    <Modal title="Add agent" maxWidth="max-w-2xl" onClose={onClose} onSubmit={submit}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Scope
          </label>
          <div className="flex gap-2">
            {SCOPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setScope(o.value)}
                title={o.hint}
                className={cn(
                  'flex flex-1 flex-col items-start rounded-md border px-2.5 py-1.5 text-left',
                  scope === o.value
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-transparent hover:border-border/80 hover:bg-accent/40',
                )}
              >
                <span className="font-mono text-[12px] font-semibold text-foreground">
                  {o.label}
                </span>
                <span className="text-[10px] text-muted-foreground">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Agent id
            </label>
            <input
              ref={idInputRef}
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. doc-writer"
              spellCheck={false}
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {idError && trimmedId && (
              <div className="mt-1 text-[10.5px] text-destructive">{idError}</div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Display name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              placeholder="e.g. Documentation Writer"
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Skills <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional — inlined into the agent's prompt)</span>
            </label>
            <div className="flex items-center gap-2">
              {/* Scope tabs — same project/global split as the Skills tab so
                  the user picks from one origin at a time. */}
              <div className="inline-flex shrink-0 rounded-md border border-border bg-card p-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setSkillScope('project')}
                  className={cn(
                    'rounded px-2 py-0.5 transition-colors',
                    skillScope === 'project'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Project <span className="opacity-60">({projectSkills.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSkillScope('global')}
                  className={cn(
                    'rounded px-2 py-0.5 transition-colors',
                    skillScope === 'global'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Global <span className="opacity-60">({globalSkills.length})</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSkillModalOpen(true)}
                className="inline-flex items-center gap-1 text-[10.5px] text-primary hover:text-primary/80"
              >
                <Plus className="h-3 w-3" /> add skill
              </button>
            </div>
          </div>
          {pickableSkills.length === 0 ? (
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
              No reusable skills yet. The agent will still be created — its prompt
              lives in the .md file. Click <strong>add skill</strong> above to
              create a reusable skill you can inline here later.
            </div>
          ) : scopedSkills.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-1.5 text-[11px] italic text-muted-foreground">
              No skills in this scope yet.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {scopedSkills.map((s) => {
                const checked = pickedSkills.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSkill(s.id)}
                    title={s.description ?? ''}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
                      checked
                        ? 'border-primary/60 bg-primary/15 text-primary'
                        : 'border-border bg-transparent text-foreground hover:border-border/80 hover:bg-accent/40',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-grid h-3 w-3 place-items-center rounded-sm border',
                        checked ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                      )}
                    >
                      {checked && <span className="h-1.5 w-1.5 rounded-[1px] bg-primary-foreground" />}
                    </span>
                    <span className="font-mono">{s.id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Model
          </label>
          <div className="flex flex-col gap-1.5">
            {MODELS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setModel(m.value)}
                className={cn(
                  'flex items-baseline gap-2 rounded-md border px-2.5 py-1.5 text-left',
                  model === m.value
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-transparent hover:border-border/80 hover:bg-accent/40',
                )}
              >
                <span className="font-mono text-[12px] font-medium text-foreground">
                  {m.label}
                </span>
                <span className="text-[10.5px] text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Description <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(one line — shown beneath the agent name)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='e.g. "Reviews TypeScript code for type-safety issues"'
            className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Capabilities <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional — MCP integrations the agent uses)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {KNOWN_CAPABILITIES.map((c) => {
              const checked = capabilities.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCap(c.id)}
                  title={c.hint}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
                    checked
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border bg-transparent text-foreground hover:border-border/80 hover:bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'inline-grid h-3 w-3 place-items-center rounded-sm border',
                      checked ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {checked && <span className="h-1.5 w-1.5 rounded-[1px] bg-primary-foreground" />}
                  </span>
                  {c.label}
                </button>
              );
            })}
            {capabilities
              .filter((c) => !KNOWN_CAPABILITIES.some((k) => k.id === c))
              .map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCap(c)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/15 px-2 py-1 font-mono text-[11px] text-primary"
                >
                  <X className="h-2.5 w-2.5" /> {c}
                </button>
              ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="text"
              value={customCapInput}
              onChange={(e) => setCustomCapInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomCap();
                }
              }}
              placeholder="custom capability id (e.g. stripe-api)"
              className="flex-1 rounded-md border border-border bg-input/50 px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={addCustomCap}
              disabled={!customCapInput.trim() || !CAP_PATTERN.test(customCapInput.trim())}
              className="rounded-md border border-border px-2 py-1 text-[10.5px] text-muted-foreground hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        {scope === 'aidlc' && (
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Env vars <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(optional — AIDLC only)</span>
              </span>
              <button
                type="button"
                onClick={() => setEnvRows((cur) => [...cur, { key: '', value: '' }])}
                className="inline-flex items-center gap-1 text-[10.5px] text-primary hover:text-primary/80"
              >
                <Plus className="h-3 w-3" /> add
              </button>
            </div>
            {envRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-[10.5px] text-muted-foreground">
                No env overrides — agent uses workspace env as-is.
              </div>
            ) : (
              <div className="space-y-1.5">
                {envRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) =>
                        setEnvRows((cur) =>
                          cur.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)),
                        )
                      }
                      placeholder="KEY"
                      className="w-1/3 rounded-md border border-border bg-input/50 px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
                    />
                    <span className="text-muted-foreground">=</span>
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) =>
                        setEnvRows((cur) =>
                          cur.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                        )
                      }
                      placeholder="value (or ${env:OTHER})"
                      className="flex-1 rounded-md border border-border bg-input/50 px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEnvRows((cur) => cur.filter((_, j) => j !== i))}
                      title="Remove"
                      className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {envError && (
              <div className="mt-1 text-[10.5px] text-destructive">{envError}</div>
            )}
          </div>
        )}
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label="Create agent" disabled={!!error} />
      </ModalFooter>

      {skillModalOpen && (
        <AddSkillModal
          takenIds={takenSkillIds ?? []}
          templates={skillTemplates ?? []}
          onSubmit={(d: AddSkillDraft) => {
            postMessage({ type: 'addSkillInline', draft: d });
            // Stay in the agent modal so the user can pick the new skill
            // once the host state push lands. The picker will show it
            // automatically via `state.skills` re-render.
          }}
          onClose={() => setSkillModalOpen(false)}
        />
      )}
    </Modal>
  );
}
