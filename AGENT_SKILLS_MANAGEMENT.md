# Agent Skills Management Implementation

## Overview
This implementation enables agents to define and manage their skills at the project-level agent file itself (`.claude/agents/<agent-id>.md`), without requiring workspace.yaml synchronization.

## Changes Made

### 1. Enhanced `parseAgentFrontmatter()` Function
**File**: `packages/extension/src/v2/workspaceWebview.ts` (lines 1060-1102)

**What Changed**:
- Now parses a `skills:` field from agent frontmatter in addition to `description`, `model`, and `tools`
- Supports both inline array format (`[skill1, skill2]`) and bullet-list YAML format
- Return type extended: `{ description?, model?, tools?, skills? }`

**Example**:
```yaml
---
name: Designer
description: Senior Product Designer agent
model: claude-opus-4-7
tools: [files, figma]
skills: [design-system-audit, figma-generate-design]
---
```

### 2. Enhanced `rewriteAgentFrontmatter()` Function
**File**: `packages/extension/src/v2/workspaceWebview.ts` (lines 1122-1190)

**What Changed**:
- Updated to write `skills:` field to the agent file's frontmatter
- Accepts `skills?: string[]` in the updates parameter (in addition to name, description, model, tools)
- Maintains stable field ordering: `name → description → model → tools → skills → custom fields`
- Preserves file body byte-for-byte

**Field Order** (when writing):
```yaml
---
name: ...
description: ...
model: ...
tools: [...]
skills: [...]
custom_field: ...
---
```

### 3. Updated `mergeAgents()` Function
**File**: `packages/extension/src/v2/workspaceWebview.ts` (lines 976-1008)

**What Changed**:
- When loading agents from discovered files (project/global scope), now reads skills from agent file frontmatter first
- Falls back to workspace.yaml skills (for backward compatibility with AIDLC agents)
- Precedence: **file-based `skills:` > workspace.yaml `skills` > undefined**

**Logic**:
```typescript
const fileSkills = fm.skills && fm.skills.length > 0 ? fm.skills : undefined;
const yamlSkills = yamlSkillsById.get(a.id);
const resolvedSkills = fileSkills ?? yamlSkills;
```

### 4. Updated `editAgentInline()` Function
**File**: `packages/extension/src/v2/workspaceWebview.ts` (lines 2716-2735)

**What Changed**:
- For project/global scope agents: writes `skills:` to the agent file's frontmatter (NOT workspace.yaml)
- Passes `skills` parameter to `rewriteAgentFrontmatter()` 
- Removed workspace.yaml sync for file-based agents — agent file is now authoritative
- AIDLC agents (workspace.yaml) still update skills there (unchanged behavior)

**Behavior**:
- User selects skills in UI → Extension updates `.claude/agents/<id>.md` frontmatter
- Agent reloads → Reads skills from file frontmatter via `parseAgentFrontmatter()`
- No workspace.yaml sync needed

## Usage Example

### Create an agent with skills:

**File**: `.claude/agents/code-reviewer.md`
```yaml
---
name: Code Reviewer
description: Reviews code diffs for bugs and security issues
model: claude-opus-4-7
tools: [files, github]
skills: [code-reviewer, security-audit]
---

# Code Reviewer Agent

You are an experienced code reviewer...
```

### Update agent skills via UI:
1. Open AIDLC workspace panel
2. Navigate to Agents tab
3. Click agent → Edit
4. Select new skills in the "Skills" picker
5. Save → `.claude/agents/<agent-id>.md` is updated with new `skills: [...]` field

### Example output after save:
```yaml
---
name: Code Reviewer
description: Reviews code diffs for bugs and security issues
model: claude-opus-4-7
tools: [files, github]
skills: [code-reviewer, security-audit, design-system-audit]
---
```

## Backward Compatibility

✅ **Fully backward compatible**:
- Old agent files without `skills:` field still work (reads from workspace.yaml if present)
- AIDLC agents in workspace.yaml unaffected (continue using workspace.yaml skills)
- Mixed environments supported: some agents file-based, others AIDLC-based

## Benefits

1. **Project-Level Configuration**: Agent skills are now defined in the agent file itself, not in a separate workspace.yaml
2. **No Sync Issues**: File is the source of truth; no risk of workspace.yaml → file conflicts
3. **Cleaner Organization**: All agent configuration in one place (the .md file)
4. **Better for Version Control**: Skills are part of the agent file; easier to review in diffs
5. **Scalability**: Projects can define many agents without bloating workspace.yaml

## Files Modified

- `packages/extension/src/v2/workspaceWebview.ts`
  - `parseAgentFrontmatter()` — added `skills` parsing
  - `rewriteAgentFrontmatter()` — added `skills` writing
  - `mergeAgents()` — file-based skills precedence
  - `editAgentInline()` — write skills to agent file for project/global scope

## UI Flow - How Skills are Displayed

### When Agent Loads:
1. `mergeAgents()` calls `parseAgentFrontmatter()` for project/global agents
2. `parseAgentFrontmatter()` extracts `skills: [...]` from agent file
3. `AgentSummary` is created with `skills` array populated
4. UI receives `AgentSummary` with skills

### When User Opens Edit Modal:
```tsx
// Line 54 of EditAgentModal.tsx
const [pickedSkills, setPickedSkills] = useState<string[]>(agent.skills ?? []);
```
- Modal initializes `pickedSkills` from `agent.skills`
- All skills in the array are displayed as ✓ checked
- Unchecked skills appear as ☐ boxes

### When User Selects/Deselects Skills:
```tsx
// Line 77-80 of EditAgentModal.tsx
const toggleSkill = (skillId: string) => {
  setPickedSkills((cur) =>
    cur.includes(skillId) ? cur.filter((s) => s !== skillId) : [...cur, skillId],
  );
};
```
- User clicks skill button → skill toggled in/out of `pickedSkills`
- UI instantly shows/hides checkmark

### When User Saves:
```tsx
// Line 99 of EditAgentModal.tsx
skills: pickedSkills,
```
- Modal submits `skills` array to host (`editAgentInline`)
- Host writes skills to agent file via `rewriteAgentFrontmatter()`
- File saved with updated `skills: [...]` field

### On Reload:
- Cycle repeats: agent file → `parseAgentFrontmatter()` → UI with checkmarks

## Testing Checklist

- [ ] Create a new agent file with `skills: [skill1, skill2]` in frontmatter
- [ ] Load project → agent appears in Agents tab
- [ ] Click agent → Edit modal opens
- [ ] **Verify**: Skills specified in file are shown as ✓ checked in modal
- [ ] **Verify**: Unchecked skills appear as ☐ boxes
- [ ] Toggle a skill (check → uncheck or vice versa)
- [ ] Click Save
- [ ] **Verify**: Agent file frontmatter updated with new skills
- [ ] Reload project
- [ ] **Verify**: New skills are still checked in modal on next edit
- [ ] Verify old agents without `skills:` field still work
- [ ] Verify AIDLC agents (workspace.yaml) unaffected
- [ ] Check file format with inline (`[skill1, skill2]`) and bullet-list formats
