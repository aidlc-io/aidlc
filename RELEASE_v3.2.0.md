# Release v3.2.0 - Agent Skills Management

**Release Date**: 2026-07-21  
**Status**: ✅ Ready for Deployment

---

## Release Artifacts

### 1. ✅ Git Commit
```
Commit: a58d5d6
Message: feat: agent skills management v3.2.0
Author: Claude Haiku 4.5
Branch: main
Status: ✅ Pushed to origin/main
```

### 2. ✅ Git Tag
```
Tag: v3.2.0
Status: ✅ Created and pushed to origin
Link: https://github.com/aidlc-io/aidlc/releases/tag/v3.2.0
```

### 3. ✅ VSIX Package
```
File: packages/extension/aidlc-3.2.0.vsix
Size: 777.82 KB
Location: /Users/meii/Documents/contribute-prj/packages/extension/
Status: ✅ Built and ready
```

### 4. ✅ Version Updates
- `packages/extension/package.json`: 3.1.0 → 3.2.0
- `CHANGELOG.md`: Added v3.2.0 release notes
- `README.md`: Updated to v3.2, added v3.2 features

---

## What's Included in v3.2.0

### Features ✨
- Agent skills management at project level
- Skills defined in agent file frontmatter (`.claude/agents/*.md`)
- Support inline and bullet-list skill formats
- Auto-reload notification with one-click reload button
- Better UI feedback with skill checkmarks

### Bug Fixes 🐛
- Fixed "skill not declared in workspace.yaml" error
- Fixed missing skills field in new agent files  
- Fixed workspace.yaml validation for AIDLC agents only

### Documentation 📚
- 8 comprehensive guides
- AGENT_SKILLS_MANAGEMENT.md
- AGENT_SKILLS_QUICK_START.md
- TEST_RESULTS.md
- BUGFIX_SUMMARY.md
- FINAL_COMPLETION_REPORT.md
- Plus example agent template

---

## Deployment Instructions

### ✅ Step 1: Auto-Release for CLI & OpenVSX
Use the `/publish` skill to auto-deploy:

```bash
# Or via CLI
npm run publish patch  # or minor/major
```

This will:
- ✅ Bump version in all package.json files
- ✅ Update CHANGELOG  
- ✅ Commit changes
- ✅ Create git tag
- ✅ Push to GitHub
- ✅ Auto-deploy to OpenVSX Registry
- ✅ Auto-deploy to NPM (CLI)

### 🔄 Step 2: Manual VS Code Marketplace Release
You'll need to push manually to VS Code Marketplace:

```bash
# Using vsce (VS Code Extension CLI)
npm install -g vsce

# Publish to marketplace (requires authentication)
vsce publish -p <personal_access_token>

# Or using ovsx CLI for Open VSX
npm install -g ovsx
ovsx publish packages/extension/aidlc-3.2.0.vsix -p <token>
```

---

## Files Changed in This Release

### Core Implementation
- `packages/extension/src/v2/workspaceWebview.ts` (6 functions)
  - parseAgentFrontmatter() - reads skills
  - rewriteAgentFrontmatter() - writes skills
  - mergeAgents() - prioritizes file-based skills
  - editAgentInline() - updates skills in file
  - addAgentInline() - creates agents with skills + reload notification
  - addSkillInline() - adds reload notification

### Configuration
- `packages/extension/package.json` - version bump to 3.2.0

### Documentation
- `CHANGELOG.md` - added v3.2.0 release notes
- `README.md` - updated version and features
- `packages/core/templates/sdlc/agents/example-with-skills.md` - example

### Release Documentation
- `AGENT_SKILLS_MANAGEMENT.md`
- `AGENT_SKILLS_QUICK_START.md`
- `BUGFIX_SUMMARY.md`
- `IMPLEMENTATION_SUMMARY.md`
- `RELOAD_NOTIFICATION_FEATURE.md`
- `TEST_RESULTS.md`
- `FINAL_COMPLETION_REPORT.md`
- `COMPLETION_CHECKLIST.txt`

---

## Verification Checklist

- ✅ Code compiles with 0 errors
- ✅ All tests passing (4/4)
- ✅ VSIX built successfully
- ✅ Git commit created
- ✅ Git tag created
- ✅ Pushed to GitHub (main branch + tag)
- ✅ Version updated in all files
- ✅ CHANGELOG updated
- ✅ README updated
- ✅ Documentation complete

---

## Next Steps

1. **Auto-Release** (using `/publish` skill):
   ```
   → Updates all versions
   → Deploys to NPM (CLI)
   → Deploys to OpenVSX
   ```

2. **Manual Release** (VS Code Marketplace):
   ```
   vsce publish -p <token>
   ```

3. **Verify Releases**:
   - Check VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=hueanmy.aidlc
   - Check Open VSX: https://open-vsx.org/extension/hueanmy/aidlc
   - Check NPM: https://www.npmjs.com/package/aidlc

---

## Release Notes Template

```markdown
## v3.2.0 - Agent Skills Management

### ✨ Features
- **Agent Skills Management** - Project-level skills configuration without workspace.yaml
  - Agent files (.claude/agents/*.md) now define `skills:` in frontmatter
  - Support inline `[skill1, skill2]` and bullet-list formats
  - Auto-reload notification with one-click reload button

### 🐛 Fixes
- Fixed "skill not declared in workspace.yaml" error for project-scope agents
- Fixed missing skills field when creating new agents
- Fixed workspace.yaml validation for AIDLC agents only

### 📈 Improvements
- Better UI feedback with skill checkmarks in edit modal
- Standardized agent file frontmatter field order
- Enhanced user notifications with actionable reload buttons

### 📚 Documentation
- Comprehensive guides for agent skills management
- Quick-start guide for users
- Example agent template with skills
```

---

**Status**: 🚀 **READY FOR RELEASE**

All code changes committed, tagged, and pushed to GitHub.  
VSIX package built and ready for deployment.  
Ready to auto-release to CLI & OpenVSX!
