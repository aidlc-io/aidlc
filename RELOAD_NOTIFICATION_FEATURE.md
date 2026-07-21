# Auto Reload Notification Feature

## Overview
When users create new skills or agents, they now see an informative message with a "Reload" button to refresh VS Code and see their changes immediately in the UI tabs.

## Implementation

### Changes Made
**File**: `packages/extension/src/v2/workspaceWebview.ts`

#### 1. Skill Creation Message (Line 2535-2541)
**Before**:
```typescript
void vscode.window.showInformationMessage(
  `Skill "${id}" added (${scope})${yamlNote}.`,
);
```

**After**:
```typescript
const action = await vscode.window.showInformationMessage(
  `Skill "${id}" added (${scope})${yamlNote}. Reload VS Code to see it in the Agents/Skills tabs.`,
  'Reload',
);
if (action === 'Reload') {
  void vscode.commands.executeCommand('workbench.action.reloadWindow');
}
```

#### 2. AIDLC Agent Creation Message (Line 2603-2609)
**Before**:
```typescript
void vscode.window.showInformationMessage(
  `Agent "${id}" added (aidlc · skills: ${skills.join(', ')}, model: ${model}).`,
);
```

**After**:
```typescript
const action = await vscode.window.showInformationMessage(
  `Agent "${id}" added (aidlc · skills: ${skills.join(', ')}, model: ${model}). Reload VS Code to see it in the Agents tab.`,
  'Reload',
);
if (action === 'Reload') {
  void vscode.commands.executeCommand('workbench.action.reloadWindow');
}
```

#### 3. Project/Global Agent Creation Message (Line 2665-2671)
**Before**:
```typescript
void vscode.window.showInformationMessage(
  `Agent "${id}" added (${scope} · skills: ${skills.join(', ')}).`,
);
```

**After**:
```typescript
const action = await vscode.window.showInformationMessage(
  `Agent "${id}" added (${scope} · skills: ${skills.join(', ')}). Reload VS Code to see it in the Agents tab.`,
  'Reload',
);
if (action === 'Reload') {
  void vscode.commands.executeCommand('workbench.action.reloadWindow');
}
```

## User Experience

### When User Creates a Skill:
```
┌─────────────────────────────────────────────────────────────────┐
│ ℹ️  Skill "my-skill" added (project). Reload VS Code to see     │
│    it in the Agents/Skills tabs.                                │
│                                          [Reload]  [Dismiss]    │
└─────────────────────────────────────────────────────────────────┘
```

### When User Creates an Agent:
```
┌─────────────────────────────────────────────────────────────────┐
│ ℹ️  Agent "api3-po" added (project · skills: rest-endpoint).    │
│    Reload VS Code to see it in the Agents tab.                  │
│                                          [Reload]  [Dismiss]    │
└─────────────────────────────────────────────────────────────────┘
```

### User Actions:
- **Click "Reload"** → VS Code window reloads → Changes appear immediately
- **Click "Dismiss"** → Message closes → User can reload manually later

## Benefits

✅ **Better UX**: Clear explanation of why reload is needed  
✅ **One-click solution**: "Reload" button triggers the reload  
✅ **Non-intrusive**: Still allows "Dismiss" if user wants to continue  
✅ **Consistent**: Applied to all agent/skill creation cases  

## Technical Details

Uses VS Code built-in APIs:
- `vscode.window.showInformationMessage()` - Show message with action buttons
- `vscode.commands.executeCommand('workbench.action.reloadWindow')` - Reload window

No external dependencies added.

## Testing

**Test Workflow**:
1. Create new skill
2. See message: "Skill added... Reload VS Code..."
3. Click "Reload" button
4. VS Code reloads
5. New skill appears in Skills tab ✅

**Test Workflow**:
1. Create new agent
2. See message: "Agent added... Reload VS Code..."
3. Click "Reload" button
4. VS Code reloads
5. New agent appears in Agents tab ✅

## Backward Compatibility

✅ No breaking changes  
✅ Only adds optional button to existing messages  
✅ If user dismisses, behavior is same as before (they can reload manually)
