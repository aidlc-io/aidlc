import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AssetScope, SkillTemplateRef } from '@/lib/types';
import { Modal, ModalFooter, ModalCancelButton, ModalConfirmButton } from './Modal';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export type SkillSourceKind = 'template' | 'blank' | 'paste';

export interface AddSkillDraft {
  scope: AssetScope;
  id: string;
  source:
    | { kind: 'template'; templateId: string }
    | { kind: 'blank' }
    | { kind: 'paste'; content: string };
}

interface Props {
  /** ids already taken across all scopes — duplicates blocked. */
  takenIds: string[];
  templates: SkillTemplateRef[];
  onSubmit: (draft: AddSkillDraft) => void;
  onClose: () => void;
}

const SCOPE_OPTIONS: Array<{ value: AssetScope; label: string; hint: string }> = [
  { value: 'project', label: 'project', hint: '.claude/skills/{id}.md (file only)' },
  { value: 'global', label: 'global', hint: '~/.claude/skills/{id}.md (file only)' },
];

const CATEGORY_ORDER: ReadonlyArray<string> = [
  'general',
  'frontend',
  'backend',
  'mobile',
  'devops',
  'data',
  'qa',
  'refactor',
  'docs',
];

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  frontend: 'Frontend',
  backend: 'Backend',
  mobile: 'Mobile',
  devops: 'DevOps',
  data: 'Data',
  qa: 'QA',
  refactor: 'Refactor',
  docs: 'Docs',
};

export function AddSkillModal({ takenIds, templates, onSubmit, onClose }: Props) {
  const [scope, setScope] = useState<AssetScope>('project');
  const [id, setId] = useState('');
  const [sourceKind, setSourceKind] = useState<SkillSourceKind>('template');
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? '');
  const [pasteContent, setPasteContent] = useState('');
  const idInputRef = useRef<HTMLInputElement>(null);

  // Order categories by `CATEGORY_ORDER` but only include ones that actually
  // have templates — keeps the chip row tight if a category goes empty.
  const categoriesPresent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of templates) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    const ordered = CATEGORY_ORDER.filter((c) => counts.has(c));
    // Stragglers — any category we forgot to enumerate above goes to the end.
    for (const c of counts.keys()) {
      if (!ordered.includes(c)) { ordered.push(c); }
    }
    return ordered.map((c) => ({ id: c, count: counts.get(c) ?? 0 }));
  }, [templates]);

  const [activeCategory, setActiveCategory] = useState<string>(
    () => templates.find((t) => t.id === templateId)?.category ?? categoriesPresent[0]?.id ?? 'general',
  );
  const visibleTemplates = useMemo(
    () => templates.filter((t) => t.category === activeCategory),
    [templates, activeCategory],
  );

  // When the active category changes, default the picked template to the
  // first one in that category so the Add button stays enabled.
  useEffect(() => {
    if (!visibleTemplates.some((t) => t.id === templateId)) {
      setTemplateId(visibleTemplates[0]?.id ?? '');
    }
  }, [visibleTemplates, templateId]);

  useEffect(() => {
    idInputRef.current?.focus();
  }, []);

  const trimmedId = id.trim();
  const idError = useMemo(() => {
    if (!trimmedId) { return 'Skill id is required'; }
    if (!ID_PATTERN.test(trimmedId)) {
      return 'Lowercase letters / digits / dashes only — must start with a letter';
    }
    if (takenIds.includes(trimmedId)) {
      return `Skill "${trimmedId}" already exists`;
    }
    return null;
  }, [trimmedId, takenIds]);

  const sourceError =
    sourceKind === 'template' && !templateId
      ? 'Pick a template'
      : sourceKind === 'paste' && !pasteContent.trim()
      ? 'Paste skill markdown'
      : null;

  const error = idError || sourceError;

  const submit = () => {
    if (error) { return; }
    const source: AddSkillDraft['source'] =
      sourceKind === 'template'
        ? { kind: 'template', templateId }
        : sourceKind === 'paste'
        ? { kind: 'paste', content: pasteContent }
        : { kind: 'blank' };
    onSubmit({ scope, id: trimmedId, source });
    onClose();
  };

  return (
    <Modal title="Add skill" maxWidth="max-w-xl" onClose={onClose} onSubmit={submit}>
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

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Skill id
          </label>
          <input
            ref={idInputRef}
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. code-reviewer"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {idError && trimmedId && (
            <div className="mt-1 text-[10.5px] text-destructive">{idError}</div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Source
          </label>
          <div className="mb-2 flex gap-2">
            {(
              [
                { v: 'template' as const, l: 'Template', h: 'Pick a starter skill' },
                { v: 'blank' as const, l: 'Blank', h: 'Empty .md, opens in editor' },
                { v: 'paste' as const, l: 'Paste', h: 'Paste markdown directly' },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setSourceKind(o.v)}
                title={o.h}
                className={cn(
                  'flex flex-1 flex-col items-start rounded-md border px-2.5 py-1.5 text-left',
                  sourceKind === o.v
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-transparent hover:border-border/80 hover:bg-accent/40',
                )}
              >
                <span className="text-[12px] font-medium text-foreground">{o.l}</span>
                <span className="text-[10px] text-muted-foreground">{o.h}</span>
              </button>
            ))}
          </div>

          {sourceKind === 'template' && (
            <>
              {/* Category chips — show only categories that actually have
                  templates. Clicking re-scopes the list below. */}
              {categoriesPresent.length > 1 && (
                <div className="-mt-1 flex flex-wrap gap-1">
                  {categoriesPresent.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCategory(c.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors',
                        activeCategory === c.id
                          ? 'border-primary/60 bg-primary/15 text-primary'
                          : 'border-border bg-transparent text-muted-foreground hover:border-border/80 hover:bg-accent/40 hover:text-foreground',
                      )}
                    >
                      <span>{CATEGORY_LABELS[c.id] ?? c.id}</span>
                      <span className="opacity-60">({c.count})</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                {templates.length === 0 ? (
                  <div className="p-3 text-center text-[11px] text-muted-foreground">
                    No templates available.
                  </div>
                ) : visibleTemplates.length === 0 ? (
                  <div className="p-3 text-center text-[11px] italic text-muted-foreground">
                    No templates in this category.
                  </div>
                ) : (
                  visibleTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2.5 py-1.5 text-left last:border-b-0',
                        templateId === t.id ? 'bg-primary/10' : 'hover:bg-accent/40',
                      )}
                    >
                      <span className="font-mono text-[12px] font-medium text-foreground">
                        {t.id}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground">{t.description}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {sourceKind === 'paste' && (
            <textarea
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder={`# My Skill\n\nYou are a ...`}
              rows={6}
              spellCheck={false}
              className="w-full resize-none rounded-md border border-border bg-input/50 px-2.5 py-2 font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          )}

          {sourceKind === 'blank' && (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
              Empty <code className="font-mono">.md</code> file will be created and opened in the editor for you to write.
            </div>
          )}
        </div>
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label="Create skill" disabled={!!error} />
      </ModalFooter>
    </Modal>
  );
}
