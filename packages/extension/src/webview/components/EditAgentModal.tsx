import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSummary, SkillSummary } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';

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

export interface EditAgentDraft {
  id: string;
  scope: AgentSummary['scope'];
  /** When unchanged, leave the file's existing `name:` alone — but the modal always sends a value. */
  name: string;
  description: string;
  model: string;
  capabilities: string[];
  /** Persona→skill binding. For file-based agents the host writes this to
   *  workspace.yaml's AIDLC layer (creating the entry if needed). */
  skills: string[];
}

interface Props {
  agent: AgentSummary;
  /** Pickable skills — filtered to project + global to match the Skills tab. */
  skills: SkillSummary[];
  onSubmit: (draft: EditAgentDraft) => void;
  onClose: () => void;
}

export function EditAgentModal({ agent, skills, onSubmit, onClose }: Props) {
  const initialName = inferName(agent);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(agent.description ?? '');
  const [model, setModel] = useState(agent.model ?? MODELS[0].value);
  const [capabilities, setCapabilities] = useState<string[]>(agent.integrations ?? []);
  const [customCapInput, setCustomCapInput] = useState('');
  const [pickedSkills, setPickedSkills] = useState<string[]>(agent.skills ?? []);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Picker mirrors the Skills tab — project + global only. The aidlc-scope
  // entries are internal workspace.yaml bindings, not pickable assets.
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
  // Default the picker to whichever scope has skills (project wins ties).
  // Persisting per-agent isn't worth the cost — the picker is one click away.
  const [skillScope, setSkillScope] = useState<'project' | 'global'>(
    projectSkills.length > 0 ? 'project' : 'global',
  );
  const scopedSkills = skillScope === 'project' ? projectSkills : globalSkills;
  const toggleSkill = (skillId: string) => {
    setPickedSkills((cur) =>
      cur.includes(skillId) ? cur.filter((s) => s !== skillId) : [...cur, skillId],
    );
  };

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const nameError = !name.trim() ? 'Display name is required' : null;
  const error = nameError;

  const submit = () => {
    if (error) { return; }
    onSubmit({
      id: agent.id,
      scope: agent.scope,
      name: name.trim(),
      description: description.trim(),
      model,
      capabilities,
      skills: pickedSkills,
    });
    onClose();
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
    <Modal
      title={`Edit agent · ${agent.id}`}
      subtitle={`scope: ${agent.scope}${agent.filePath ? ' — ' + truncatePath(agent.filePath) : ''}`}
      maxWidth="max-w-2xl"
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Agent id
            </label>
            <input
              type="text"
              value={agent.id}
              disabled
              className="w-full cursor-not-allowed rounded-md border border-border bg-secondary/30 px-2.5 py-2 font-mono text-[12px] text-muted-foreground"
            />
            <div className="mt-1 text-[10.5px] text-muted-foreground/80">
              Id is the filename — use Rename instead of Edit to change it.
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Display name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Documentation Writer"
              className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
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
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              Skills <span className="font-normal normal-case tracking-normal text-muted-foreground/80">(which reusable skills this agent makes available)</span>
            </label>
            {/* Scope tabs — same project/global split as the Skills tab so
                the user picks from one origin at a time instead of scrolling
                a flat list of dozens. AIDLC-scope skills are intentionally
                hidden (they're internal workspace.yaml bindings). */}
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
          </div>
          {pickableSkills.length === 0 ? (
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
              No reusable skills yet — create one from the Skills tab and it'll show up here.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {scopedSkills.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-1.5 text-[11px] italic text-muted-foreground">
                  No skills in this scope yet.
                </div>
              ) : (
                scopedSkills.map((s) => {
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
                })
              )}
              {/* Surface skills currently bound that aren't in the pickable
                  list (e.g. AIDLC built-in phase skills). Lets the user
                  see + un-toggle them without losing track of the binding.
                  Always visible regardless of the active scope tab. */}
              {pickedSkills
                .filter((s) => !pickableSkills.some((p) => p.id === s))
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSkill(s)}
                    title="Existing binding (not in project/global lists) — click to drop"
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/15 px-2 py-1 font-mono text-[11px] text-primary"
                  >
                    <X className="h-2.5 w-2.5" /> {s}
                  </button>
                ))}
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
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label="Save changes" disabled={!!error} />
      </ModalFooter>
    </Modal>
  );
}

/**
 * Pick a sensible starting value for the Display Name input. Frontmatter
 * `description` lives in `agent.description`; if the host hasn't surfaced
 * the agent's display name we fall back to a title-cased id.
 */
function inferName(agent: AgentSummary): string {
  // AgentSummary doesn't carry the YAML `name:` field directly today — the
  // host could surface it later. For now derive from id.
  return agent.id.replace(/^aidlc-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncatePath(p: string): string {
  // Show last 2 path segments so the modal subtitle stays readable.
  const parts = p.split('/');
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
}
