#!/usr/bin/env python3

import sys
import os
import re
from pathlib import Path

# Try to import yaml
try:
    import yaml
except ImportError:
    # Fallback: use basic YAML parsing without external dependency
    yaml = None

def parse_frontmatter(content):
    """Extract frontmatter from markdown file"""
    match = re.match(r'^---\n([\s\S]*?)\n---', content)
    if not match:
        return {}

    fm_text = match.group(1)
    frontmatter = {}

    # Simple YAML parsing without library
    for line in fm_text.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            frontmatter[key.strip()] = value.strip().strip('"\'')

    return frontmatter

def declare_skill_or_agent(file_path):
    """Add skill/agent to workspace.yaml if not already declared"""

    project_root = os.getcwd()
    file_path = os.path.abspath(file_path)

    # Determine if skill or agent
    is_skill = '.claude/skills/' in file_path
    is_agent = '.claude/agents/' in file_path

    if not is_skill and not is_agent:
        return

    # Get file name
    file_name = Path(file_path).stem

    # Read and parse frontmatter
    with open(file_path, 'r') as f:
        content = f.read()

    frontmatter = parse_frontmatter(content)
    skill_id = frontmatter.get('name', file_name)
    description = frontmatter.get('description', '')

    # Read workspace.yaml
    workspace_path = os.path.join(project_root, '.aidlc/workspace.yaml')
    if not os.path.exists(workspace_path):
        return

    with open(workspace_path, 'r') as f:
        workspace_content = f.read()

    # Parse YAML
    if yaml:
        workspace = yaml.safe_load(workspace_content) or {}
    else:
        # Skip if can't parse without yaml library
        return

    if is_skill:
        # Ensure skills array exists
        if 'skills' not in workspace:
            workspace['skills'] = []

        # Check if already declared
        if any(s.get('id') == skill_id for s in workspace['skills']):
            return

        # Get relative path
        relative_path = f'.claude/skills/{file_name}.md'

        # Add skill
        workspace['skills'].append({
            'id': skill_id,
            'path': relative_path
        })

    elif is_agent:
        # Ensure agents array exists
        if 'agents' not in workspace:
            workspace['agents'] = []

        # Check if already declared
        if any(a.get('id') == skill_id for a in workspace['agents']):
            return

        # Add agent with defaults
        workspace['agents'].append({
            'id': skill_id,
            'name': frontmatter.get('name', skill_id),
            'skills': frontmatter.get('skills', []) or [],
            'model': frontmatter.get('model', 'claude-sonnet-5'),
            'description': description,
            'capabilities': frontmatter.get('capabilities', []) or []
        })

    # Write back
    output = yaml.dump(workspace, default_flow_style=False, sort_keys=False)
    with open(workspace_path, 'w') as f:
        f.write(output)

if __name__ == '__main__':
    # Read file path from stdin
    try:
        file_path = sys.stdin.read().strip()
        if file_path:
            declare_skill_or_agent(file_path)
    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        sys.exit(1)
