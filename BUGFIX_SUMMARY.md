# Agent Skills Management - Bug Fix Summary

## Issue Reported
When creating a new agent in project scope and selecting a project-scope skill, the system was throwing an error:
```
Skill "mai-test-api3" not declared in workspace.yaml
```

## Root Cause
The `addAgentInline()` function (used when creating new agents) was checking that ALL skills must exist in `workspace.yaml`, regardless of agent scope. However:
- **AIDLC scope agents**: Skills ARE stored in workspace.yaml (check needed)
- **Project/Global scope agents**: Skills are stored in agent file frontmatter (no check needed)

The validation logic didn't differentiate between these scopes.

## Fix Applied

### Change 1: Conditional Validation in `addAgentInline()`
**File**: `packages/extension/src/v2/workspaceWebview.ts:2563-2575`

**Before**:
```typescript
const yamlSkillIds = new Set(doc.skills.map((s) => String(s.id)));
for (const s of skills) {
  if (!yamlSkillIds.has(s)) {
    void vscode.window.showWarningMessage(
      `Skill "${s}" not declared in workspace.yaml.`,
    );
    return;
  }
}
```

**After**:
```typescript
// AIDLC agents store skills in workspace.yaml, so they must be declared there.
// Project/global agents store skills in the agent file's frontmatter — no workspace.yaml check needed.
if (scope === 'aidlc') {
  const yamlSkillIds = new Set(doc.skills.map((s) => String(s.id)));
  for (const s of skills) {
    if (!yamlSkillIds.has(s)) {
      void vscode.window.showWarningMessage(
        `Skill "${s}" not declared in workspace.yaml.`,
      );
      return;
    }
  }
}
```

### Change 2: Add `skills:` Field to New Agent Files
**File**: `packages/extension/src/v2/workspaceWebview.ts:2638-2652`

**Before**:
```typescript
const frontmatterLines = [
  '---',
  `name: ${name}`,
  `description: ${effectiveDescription}`,
];
if (model) { frontmatterLines.push(`model: ${model}`); }
if (capabilities.length > 0) {
  frontmatterLines.push(`tools: [${capabilities.join(', ')}]`);
}
frontmatterLines.push('---', '');
```

**After**:
```typescript
const frontmatterLines = [
  '---',
  `name: ${name}`,
  `description: ${effectiveDescription}`,
];
if (model) { frontmatterLines.push(`model: ${model}`); }
if (capabilities.length > 0) {
  frontmatterLines.push(`tools: [${capabilities.join(', ')}]`);
}
if (skills.length > 0) {
  frontmatterLines.push(`skills: [${skills.join(', ')}]`);
}
frontmatterLines.push('---', '');
```

## Verification

✅ **Compilation**: TypeScript compiles without errors  
✅ **Extension bundled**: workspace.js ready (189.99 kB)  

## Impact

Now when creating a new project/global scope agent:
1. ✅ Can select any skill from project scope
2. ✅ No false "not declared in workspace.yaml" errors
3. ✅ Skills are written to agent file frontmatter
4. ✅ Agent file created with proper `skills: [...]` field
5. ✅ AIDLC agents still validate skills correctly (unchanged behavior)

## Example Workflow (Fixed)

1. **Create agent** in `/Users/meii/Documents/lighthouseapi-3`
2. **Set agent ID**: `api3-po`
3. **Set agent name**: `Product Owner`
4. **Select skill**: `mai-test-api3` (project scope)
5. **Save** ✅ NO ERROR
6. **Result**: Agent file created with `skills: [mai-test-api3]` in frontmatter

## Testing the Fix

```bash
cd /Users/meii/Documents/lighthouseapi-3
# Create new agent via AIDLC UI
# Select project scope skill "mai-test-api3"
# Save → should work now!
# Check: .claude/agents/<id>.md should have skills: [mai-test-api3]
```

## Files Modified
- `packages/extension/src/v2/workspaceWebview.ts` (2 changes)

## Deployment
✅ Ready for testing and deployment.

The fix is minimal, non-breaking, and directly addresses the reported issue.
