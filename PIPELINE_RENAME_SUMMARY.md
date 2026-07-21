# Pipeline Rename: sdlc-parallel-pipeline → aidlc-workflow

**Date**: 2026-07-21  
**Status**: ✅ Complete & Pushed

---

## What Changed

### Pipeline ID Rename
- **Old**: `sdlc-parallel-pipeline`
- **New**: `aidlc-workflow`

### Display Name Update
- **Old**: "SDLC Pipeline"
- **New**: "AIDLC Workflow"

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/presets/globalDefaults.ts` | Updated DEFAULT_GLOBAL_WORKFLOW_IDS array |
| `packages/core/src/presets/builtinWorkflows.ts` | Updated workflow ID and display name |
| `packages/extension/src/webview/components/InitWorkflowModal.tsx` | Updated workflow ID and title in OPTIONS |
| `packages/extension/src/v2/workspaceCommands.ts` | Updated recommended workflow check |
| `packages/extension/src/v2/workspaceWebview.ts` | Updated applyPreset command calls (2 places) |

---

## Verification

✅ **All references updated** - No remaining "sdlc-parallel-pipeline" in codebase  
✅ **Compilation successful** - 0 errors  
✅ **Commit created** - ec64877  
✅ **Pushed to main** - ✅ origin/main updated  

---

## Impact

- ✅ Users who load default AIDLC workflow will now see "AIDLC Workflow"
- ✅ CLI commands using `sdlc-parallel-pipeline` will need to use `aidlc-workflow`
- ✅ Existing workspace.yaml files with old ID will need migration (optional)
- ✅ Better branding alignment

---

## Next Steps

1. ✅ Compilation verification: PASS
2. ✅ Code pushed to main
3. **Next**: Include in next release (v3.2.1 or v3.3.0)
4. **Optional**: Create migration guide for users with old workspace.yaml

---

## Git Details

```
Commit: ec64877
Message: feat: rename sdlc-parallel-pipeline to aidlc-workflow
Branch: main
Pushed: Yes ✅
```

---

## Backward Compatibility Note

⚠️ **Breaking Change**: Existing workspace.yaml files using `sdlc-parallel-pipeline` will need to update to `aidlc-workflow` or recreate the pipeline via the UI.

Migration command (if needed):
```bash
# Update workspace.yaml manually:
sed -i 's/sdlc-parallel-pipeline/aidlc-workflow/g' .aidlc/workspace.yaml
```

---

**Status**: 🎉 **COMPLETE**
