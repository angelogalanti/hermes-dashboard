#!/usr/bin/env python3
"""Hermes Dashboard API — JSON status endpoint.

Exposes GET /api/status with profiles and kanban data.
"""

import json
import os
import sqlite3
from pathlib import Path

import yaml
from flask import Flask, jsonify

app = Flask(__name__)

PROFILES_DIR = Path.home() / '.hermes' / 'profiles'
KANBAN_DB = Path.home() / '.hermes' / 'kanban.db'
SHARED_SKILLS_DIR = Path.home() / '.hermes' / 'skills-shared'
PRIMARY_SKILLS_DIR = Path.home() / '.hermes' / 'skills-primary'
GLOBAL_SKILLS_DIR = Path.home() / '.hermes' / 'skills'


# ── Helpers ────────────────────────────────────────────────────────
def _pid_is_alive(pid: int | None) -> bool:
    """Check if a process is alive using os.kill(pid, 0)."""
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except (OSError, PermissionError):
        return False


# ── CORS aperto (sviluppo locale) ──────────────────────────────────
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    return response


# ── Helpers per skill ──────────────────────────────────────────────
def _scan_skills_dir(scan_dir: Path) -> tuple[set[str], set[str]]:
    """Scan a directory for SKILL.md files.

    Returns (set of skill names, set of categories).
    Handles both flat (<skill>/SKILL.md) and categorized (<cat>/<skill>/SKILL.md) layouts.
    """
    names: set[str] = set()
    categories: set[str] = set()
    if not scan_dir.is_dir():
        return names, categories
    for sf in sorted(scan_dir.rglob('SKILL.md')):
        rel = sf.relative_to(scan_dir)
        parts = rel.parts
        if len(parts) == 2:
            # <skill-name>/SKILL.md — flat
            names.add(parts[0])
        elif len(parts) == 3:
            # <category>/<skill-name>/SKILL.md
            categories.add(parts[0])
            names.add(parts[1])
        # Longer paths (deeper subdirs) are references/scripts — ignore
    return names, categories


def _load_skill_descriptions(scan_dir: Path) -> dict[str, str]:
    """Scan a directory for SKILL.md files and extract descriptions from YAML frontmatter.

    Returns {skill_name: description_string}.
    Handles both flat (<skill>/SKILL.md) and categorized (<cat>/<skill>/SKILL.md) layouts.
    """
    descriptions: dict[str, str] = {}
    if not scan_dir.is_dir():
        return descriptions
    for sf in sorted(scan_dir.rglob('SKILL.md')):
        rel = sf.relative_to(scan_dir)
        parts = rel.parts
        if len(parts) == 2:
            skill_name = parts[0]
        elif len(parts) == 3:
            skill_name = parts[1]
        else:
            continue
        try:
            with open(sf) as f:
                content = f.read(4096)  # Read enough for frontmatter
            # Parse YAML frontmatter between --- markers
            content = content.lstrip('\ufeff')
            if content.startswith('---'):
                end_idx = content.find('---', 3)
                if end_idx != -1:
                    yaml_block = content[3:end_idx]
                    fm = yaml.safe_load(yaml_block)
                    if isinstance(fm, dict) and 'description' in fm:
                        desc = str(fm['description']).strip()
                        if desc:
                            descriptions[skill_name] = desc
        except (OSError, UnicodeDecodeError, yaml.YAMLError):
            pass
    return descriptions


def _build_skill_lists(
    local_names: set[str],
    shared_names: set[str],
    primary_names: set[str] | None = None,
    local_categories: set[str] | None = None,
    shared_categories: set[str] | None = None,
    primary_categories: set[str] | None = None,
    usage: dict | None = None,
    descriptions: dict[str, str] | None = None,
) -> dict:
    """Build the full skill response dict with local/shared/primary split + legacy fields.

    Each skill dict now carries all fields from .usage.json plus category:
      name, category, use_count, view_count, patch_count,
      created_at, last_used_at, last_viewed_at, last_patched_at,
      state, pinned.
    """
    if local_categories is None:
        local_categories = set()
    if shared_categories is None:
        shared_categories = set()
    if primary_categories is None:
        primary_categories = set()
    if usage is None:
        usage = {}
    if descriptions is None:
        descriptions = {}

    # Primary takes precedence over shared (but local still highest)
    # First subtract local from shared/primary, then primary from shared
    shared_names = shared_names - local_names
    if primary_names:
        primary_names = primary_names - local_names
        shared_names = shared_names - primary_names

    local_skills: dict[str, dict] = {}
    shared_skills: dict[str, dict] = {}
    primary_skills: dict[str, dict] = {}
    all_categories: set[str] = set(local_categories) | set(shared_categories) | set(primary_categories)

    def _build_skill_obj(skill_name, u, category):
        return {
            'name': skill_name,
            'category': category,
            'description': descriptions.get(skill_name, ''),
            'use_count': u.get('use_count', 0) if u else 0,
            'view_count': u.get('view_count', 0) if u else 0,
            'patch_count': u.get('patch_count', 0) if u else 0,
            'created_at': u.get('created_at') if u else None,
            'last_used_at': u.get('last_used_at') if u else None,
            'last_viewed_at': u.get('last_viewed_at') if u else None,
            'last_patched_at': u.get('last_patched_at') if u else None,
            'state': u.get('state', 'active') if u else 'active',
            'pinned': u.get('pinned', False) if u else False,
        }

    def _merge(target, skill_name, u, category):
        existing = target.get(skill_name)
        if existing and existing['use_count'] >= u.get('use_count', 0):
            return
        target[skill_name] = _build_skill_obj(skill_name, u, category)

    # ── First pass: usage data (has use_count) ──
    for usage_key, u in usage.items():
        if not isinstance(u, dict) or u.get('state') != 'active':
            continue
        if '/' in usage_key:
            cat, skill_name = usage_key.split('/', 1)
            all_categories.add(cat)
        else:
            cat = None
            skill_name = usage_key

        if skill_name in local_names:
            _merge(local_skills, skill_name, u, cat)
        elif primary_names and skill_name in primary_names:
            _merge(primary_skills, skill_name, u, cat)
        elif skill_name in shared_names:
            _merge(shared_skills, skill_name, u, cat)
        # Orphan: usage data without SKILL.md on disk → skip (was deleted)

    # ── Second pass: skills from directory scan (never used — use_count=0) ──
    for skill_name in sorted(local_names):
        if skill_name not in local_skills:
            local_skills[skill_name] = _build_skill_obj(skill_name, None, None)
    if primary_names:
        for skill_name in sorted(primary_names):
            if skill_name not in primary_skills:
                primary_skills[skill_name] = _build_skill_obj(skill_name, None, None)
    for skill_name in sorted(shared_names):
        if skill_name not in shared_skills:
            shared_skills[skill_name] = _build_skill_obj(skill_name, None, None)

    # ── Sort all lists ──
    local_sorted = sorted(local_skills.values(), key=lambda s: s['use_count'], reverse=True)
    primary_sorted = sorted(primary_skills.values(), key=lambda s: s['use_count'], reverse=True)
    shared_sorted = sorted(shared_skills.values(), key=lambda s: s['use_count'], reverse=True)

    # ── Combined list for legacy fields ──
    all_known = list(local_skills.values()) + list(primary_skills.values()) + list(shared_skills.values())
    combined_sorted = sorted(all_known, key=lambda s: s['use_count'], reverse=True)
    top5 = combined_sorted[:5]

    # Helper: strip to legacy fields for backward compat
    def _legacy(sk):
        return {
            'name': sk['name'], 'use_count': sk['use_count'],
            'last_used_at': sk['last_used_at'],
        }

    result: dict = {
        'local': {
            'total': len(local_sorted),
            'categories': sorted(local_categories),
            'list': list(local_sorted),
        },
        'shared': {
            'total': len(shared_sorted),
            'categories': sorted(shared_categories),
            'list': list(shared_sorted),
        },
        # Legacy fields (backward compat per-profile badge)
        'total': len(local_sorted) + len(shared_sorted) + len(primary_sorted),
        'categories': sorted(all_categories),
        'top': [_legacy(s) for s in top5],
        'list': [_legacy(s) for s in combined_sorted],
    }

    # Add primary section only when there are primary skills
    if primary_names:
        result['primary'] = {
            'total': len(primary_sorted),
            'categories': sorted(primary_categories),
            'list': list(primary_sorted),
        }
    else:
        result['primary'] = None

    return result


# ── Skill per profilo ──────────────────────────────────────────────
def _load_profile_skills(name: str) -> dict | None:
    """Legge le skill installate per un profilo, separate in locali, condivise e primarie.

    Locali: skills/ del profilo. Condivise: external_dirs dal config.yaml.
    Primarie: external_dirs che puntano a skills-primary.
    """
    skills_dir = PROFILES_DIR / name / 'skills'

    # Legge external_dirs dal config.yaml del profilo
    config_path = PROFILES_DIR / name / 'config.yaml'
    external_dirs: list[Path] = []
    if config_path.is_file():
        with open(config_path) as f:
            cfg = yaml.safe_load(f)
        if isinstance(cfg, dict):
            sk_cfg = cfg.get('skills', {})
            if isinstance(sk_cfg, dict):
                ext = sk_cfg.get('external_dirs', [])
                if isinstance(ext, list):
                    external_dirs = [Path(d) for d in ext if isinstance(d, str) and Path(d).is_dir()]

    if not skills_dir.is_dir() and not external_dirs:
        return None

    # Carica usage data
    usage_path = skills_dir / '.usage.json'
    usage: dict = {}
    if usage_path.is_file():
        with open(usage_path) as f:
            usage = json.load(f)

    # Carica descrizioni skill
    desc_local: dict[str, str] = {}
    desc_shared: dict[str, str] = {}
    desc_primary: dict[str, str] = {}

    # Scansiona directory locali
    local_names, local_categories = _scan_skills_dir(skills_dir)
    desc_local = _load_skill_descriptions(skills_dir)

    # Separa directory primarie da quelle condivise
    primary_dirs: list[Path] = []
    shared_dirs: list[Path] = []
    primary_ref = PRIMARY_SKILLS_DIR.resolve()
    for d in external_dirs:
        if d.resolve() == primary_ref:
            primary_dirs.append(d)
        else:
            shared_dirs.append(d)

    # Scansiona directory condivise (non-primary)
    shared_names: set[str] = set()
    shared_categories: set[str] = set()
    for ext_dir in shared_dirs:
        sn, sc = _scan_skills_dir(ext_dir)
        shared_names |= sn
        shared_categories |= sc
        for k, v in _load_skill_descriptions(ext_dir).items():
            desc_shared[k] = v

    # Scansiona directory primarie
    primary_names: set[str] = set()
    primary_categories: set[str] = set()
    for prim_dir in primary_dirs:
        sn, sc = _scan_skills_dir(prim_dir)
        primary_names |= sn
        primary_categories |= sc
        for k, v in _load_skill_descriptions(prim_dir).items():
            desc_primary[k] = v

    # Merge descriptions: primary overrides shared, local overrides all
    merged_desc: dict[str, str] = {}
    merged_desc.update(desc_shared)
    merged_desc.update(desc_primary)
    merged_desc.update(desc_local)

    return _build_skill_lists(
        local_names, shared_names, primary_names,
        local_categories, shared_categories, primary_categories,
        usage, merged_desc,
    )


# ── Caricamento profili ────────────────────────────────────────────
def _load_profile(name: str) -> dict | None:
    """Carica un profilo e torna dict o None se senza model.default."""
    config_path = PROFILES_DIR / name / 'config.yaml'
    gateway_path = PROFILES_DIR / name / 'gateway_state.json'

    info: dict = {
        'name': name,
        'gateway': 'stopped',
        'model': None,
        'provider': None,
        'platforms': [],
        'skills': None,
        'has_soul': (PROFILES_DIR / name / 'SOUL.md').exists() or (PROFILES_DIR / name / 'SOUL.md').is_symlink(),
        'has_agents': (PROFILES_DIR / name / 'AGENTS.md').exists() or (PROFILES_DIR / name / 'AGENTS.md').is_symlink(),
    }

    # Legge config.yaml → model.default e model.provider
    if config_path.is_file():
        with open(config_path) as f:
            cfg = yaml.safe_load(f)
        if isinstance(cfg, dict):
            mc = cfg.get('model', {})
            if isinstance(mc, dict):
                info['model'] = mc.get('default')
                info['provider'] = mc.get('provider')

    # Ignora profili senza model.default
    if not info['model']:
        return None

    # Legge gateway_state.json se presente
    if gateway_path.is_file():
        try:
            with open(gateway_path) as f:
                gw = json.load(f)
            gw_state = gw.get('gateway_state', 'unknown')
            gw_pid = gw.get('pid')
            platforms_raw = gw.get('platforms', {})
            # Se PID presente ma processo morto → stato fittizio
            if gw_pid and not _pid_is_alive(gw_pid):
                gw_state = 'stopped'
                platforms_raw = {}
            info['gateway'] = gw_state
            info['platforms'] = sorted(
                p for p, v in platforms_raw.items()
                if isinstance(v, dict) and v.get('state') == 'connected'
            )
        except (json.JSONDecodeError, OSError):
            pass

    # Legge skill del profilo
    info['skills'] = _load_profile_skills(name)

    return info


def _load_default_profile() -> dict | None:
    """Profilo virtuale 'default' dal config.yaml principale di Hermes.

    Skill locali: ~/.hermes/skills/ (globali).
    Skill condivise: ~/.hermes/skills-shared/.
    """
    config_path = Path.home() / '.hermes' / 'config.yaml'
    if not config_path.is_file():
        return None

    with open(config_path) as f:
        cfg = yaml.safe_load(f)

    if not isinstance(cfg, dict):
        return None

    mc = cfg.get('model', {})
    model = mc.get('default') if isinstance(mc, dict) else None
    provider = mc.get('provider') if isinstance(mc, dict) else None

    # Skill locali da ~/.hermes/skills/ (globali)
    # Skill condivise da ~/.hermes/skills-shared/
    # Skill primarie da ~/.hermes/skills-primary/
    local_names, local_categories = _scan_skills_dir(GLOBAL_SKILLS_DIR)
    shared_names, shared_categories = _scan_skills_dir(SHARED_SKILLS_DIR)
    primary_names, primary_categories = _scan_skills_dir(PRIMARY_SKILLS_DIR)

    # Carica descrizioni skill
    desc_local = _load_skill_descriptions(GLOBAL_SKILLS_DIR)
    desc_shared = _load_skill_descriptions(SHARED_SKILLS_DIR)
    desc_primary = _load_skill_descriptions(PRIMARY_SKILLS_DIR)
    merged_desc: dict[str, str] = {}
    merged_desc.update(desc_shared)
    merged_desc.update(desc_primary)
    merged_desc.update(desc_local)

    # Carica usage data dal global skills dir
    usage: dict = {}
    usage_path = GLOBAL_SKILLS_DIR / '.usage.json'
    if usage_path.is_file():
        with open(usage_path) as f:
            usage = json.load(f)

    skills = _build_skill_lists(local_names, shared_names, primary_names, local_categories, shared_categories, primary_categories, usage, merged_desc)

    # Legge gateway_state.json della root (default profile gateway)
    gateway = 'unknown'
    platforms = []
    gw_path = Path.home() / '.hermes' / 'gateway_state.json'
    if gw_path.is_file():
        try:
            with open(gw_path) as f:
                gw = json.load(f)
            gw_state = gw.get('gateway_state', 'unknown')
            gw_pid = gw.get('pid')
            plat = gw.get('platforms', {})
            # Se PID presente ma processo morto → stato fittizio
            if gw_pid and not _pid_is_alive(gw_pid):
                gw_state = 'stopped'
                plat = {}
            gateway = gw_state
            platforms = sorted(
                p for p, v in plat.items()
                if isinstance(v, dict) and v.get('state') == 'connected'
            )
        except (json.JSONDecodeError, OSError):
            pass

    return {
        'name': 'default',
        'gateway': gateway,
        'model': model,
        'provider': provider,
        'platforms': platforms,
        'skills': skills,
        'has_soul': (Path.home() / '.hermes' / 'SOUL.md').exists() or (Path.home() / '.hermes' / 'SOUL.md').is_symlink(),
        'has_agents': (Path.home() / '.hermes' / 'AGENTS.md').exists() or (Path.home() / '.hermes' / 'AGENTS.md').is_symlink(),
    }


def load_profiles() -> list[dict]:
    """Legge tutti i profili con config.yaml e model.default valido."""
    profiles: list[dict] = []

    # Virtual default profile first
    default = _load_default_profile()
    if default is not None:
        profiles.append(default)

    # Real profiles from ~/.hermes/profiles/
    if PROFILES_DIR.is_dir():
        for entry in sorted(PROFILES_DIR.iterdir()):
            if entry.is_dir() and (entry / 'config.yaml').is_file():
                info = _load_profile(entry.name)
                if info is not None:
                    profiles.append(info)
    return profiles


# ── Caricamento kanban ─────────────────────────────────────────────
def load_kanban() -> list[dict]:
    """Legge i task dalla tabella tasks del kanban DB."""
    if not KANBAN_DB.is_file():
        return []
    try:
        conn = sqlite3.connect(str(KANBAN_DB))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            'SELECT id, title, status, assignee '
            'FROM tasks WHERE status != ? ORDER BY created_at DESC',
            ('archived',)
        )
        rows = cur.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except sqlite3.Error:
        return []


# ── Endpoint ───────────────────────────────────────────────────────
@app.route('/api/status')
def api_status():
    """GET /api/status → JSON con profili e task kanban."""
    return jsonify({
        'profiles': load_profiles(),
        'kanban': load_kanban(),
    })


@app.route('/api/profile/<name>/soul')
def api_profile_soul(name):
    """GET /api/profile/<name>/soul - JSON with SOUL.md content."""
    if name == "default":
        path = Path.home() / ".hermes" / "SOUL.md"
    else:
        path = PROFILES_DIR / name / "SOUL.md"
    if path.is_file():
        try:
            content = path.read_text(encoding="utf-8")
            return jsonify({"exists": True, "content": content, "path": str(path)})
        except OSError:
            return jsonify({"exists": False})
    return jsonify({"exists": False})


@app.route('/api/profile/<name>/agents')
def api_profile_agents(name):
    """GET /api/profile/<name>/agents - JSON with AGENTS.md content."""
    if name == "default":
        path = Path.home() / ".hermes" / "AGENTS.md"
    else:
        path = PROFILES_DIR / name / "AGENTS.md"
    if path.is_file():
        try:
            content = path.read_text(encoding="utf-8")
            return jsonify({"exists": True, "content": content, "path": str(path)})
        except OSError:
            return jsonify({"exists": False})
    return jsonify({"exists": False})


@app.route('/')
def index():
    return app.send_static_file('index.html')


# ── Main ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5151)
