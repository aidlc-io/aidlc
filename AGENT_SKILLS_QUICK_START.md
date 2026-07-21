# Agent Skills Management - Quick Start Guide

## What's New?

Agent files can now define their own `skills:` field directly in the frontmatter. No more workspace.yaml configuration needed!

## Example

Create `.claude/agents/my-agent.md`:

```yaml
---
name: My Custom Agent
description: Detailed description of what this agent does
model: claude-opus-4-7
tools: [files, github]
skills: [code-reviewer, security-audit, test-converter]
---

# My Custom Agent

Your agent prompt and instructions go here...
```

## How to Use

### 1. Add Skills to New Agent Files

When creating `.claude/agents/<id>.md`, add the `skills:` field:

```yaml
skills: [skill1, skill2, skill3]
```

### 2. Update Skills via UI

1. Open AIDLC Workspace panel
2. Go to **Agents** tab
3. Click your agent → **Edit**
4. In the **Skills** section, toggle skill buttons
5. Click **Save**
6. Agent file is automatically updated ✓

### 3. Manual File Edit

Edit `.claude/agents/<id>.md` directly and add/modify the `skills:` field:

```yaml
skills: [code-reviewer, security-audit]
```

## Supported Formats

### Inline Array (Recommended)
```yaml
skills: [skill1, skill2, skill3]
```

### Bullet List
```yaml
skills:
  - skill1
  - skill2
  - skill3
```

## What Skills Are Available?

1. **Check the Skills tab** in AIDLC Workspace
2. **Project scope** - skills in `.claude/skills/`
3. **Global scope** - skills in `~/.claude/skills/`

## Examples

### Code Reviewer Agent
```yaml
---
name: Code Reviewer
description: Senior engineer reviewing TypeScript code for bugs and type safety
model: claude-opus-4-7
tools: [files, github]
skills: [code-reviewer, type-strictness, dead-code-finder]
---
```

### Documentation Writer Agent
```yaml
---
name: Documentation Writer
description: Technical writer creating user-facing docs
model: claude-sonnet-5
tools: [files]
skills: [doc-writer, getting-started-readme, release-notes]
---
```

### API Designer Agent
```yaml
---
name: API Designer
description: Senior backend engineer designing REST APIs
model: claude-opus-4-7
tools: [files, github]
skills: [rest-endpoint, openapi-contract, db-migration, n-plus-one-audit]
---
```

## FAQ

**Q: Can I still use workspace.yaml for skills?**  
A: Yes! Agent files take precedence, but workspace.yaml still works for backward compatibility.

**Q: Do I need to update existing agents?**  
A: No. Old agents without `skills:` field continue working as before.

**Q: Where are skills stored?**  
A: **Now**: In the agent file at `.claude/agents/<id>.md`  
**Not**: workspace.yaml (unless using AIDLC workspace agents)

**Q: How do I change an agent's skills?**  
A: Either:
- Edit the agent via the UI (Edit modal) → Save → file updated
- Manually edit `.claude/agents/<id>.md` and modify the `skills:` field

**Q: Are AIDLC workspace agents affected?**  
A: No. AIDLC agents in workspace.yaml work exactly as before.

## Before & After

### Before (workspace.yaml only)
```yaml
agents:
  - id: my-agent
    name: My Agent
    skills: [code-reviewer]
```

### After (file-based)
File: `.claude/agents/my-agent.md`
```yaml
---
name: My Agent
skills: [code-reviewer]
---
```

**Benefits**:
- ✅ Cleaner organization - agent config in one file
- ✅ Better version control - easier to review in diffs
- ✅ No sync issues - file is the source of truth
- ✅ Scalability - projects with many agents

## Troubleshooting

**Problem**: Skills not appearing in modal  
**Solution**: Verify skills exist in `.claude/skills/` or `~/.claude/skills/`

**Problem**: Changes to frontmatter not showing  
**Solution**: Reload the project (File → Revert All)

**Problem**: Unsure which skills to use  
**Solution**: Check the **Skills** tab or built-in skill templates in Add Skill modal

## Next: Try It Out

1. Open your project in VS Code
2. Go to **AIDLC Workspace** panel
3. Click **Agents** tab
4. Create new agent or edit existing one
5. Add `skills:` field and select skills
6. Save and verify file updated
