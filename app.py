#!/usr/bin/env python3
"""Hermes Dashboard API — JSON status endpoint.

Exposes GET /api/status with profiles and kanban data.
"""

import hashlib
import json
import logging
import os
import shutil
import sqlite3
import time
from pathlib import Path

import yaml
from flask import Flask, jsonify, request, Response

import credit_check
import health_check
import opencode_usage_scraper

app = Flask(__name__)

# ── Logging strutturato ──────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
log = logging.getLogger('hermes-dashboard')

# ── Cache in-memory per /api/status (scansioni disco+sqlite costose) ──
_STATUS_CACHE: dict = {'ts': 0.0, 'payload': None}
STATUS_CACHE_TTL = 10  # secondi (allineato al refresh veloce del frontend)

PROFILES_DIR = Path.home() / '.hermes' / 'profiles'
KANBAN_DB = Path.home() / '.hermes' / 'kanban.db'
SHARED_SKILLS_DIR = Path.home() / '.hermes' / 'skills-shared'
PRIMARY_SKILLS_DIR = Path.home() / '.hermes' / 'skills-generalist'
FRONTLINE_SKILLS_DIR = Path.home() / '.hermes' / 'skills-frontline'
WORKER_SKILLS_DIR = Path.home() / '.hermes' / 'skills-worker'
OPERATOR_SKILLS_DIR = Path.home() / '.hermes' / 'skills-operators'
GLOBAL_SKILLS_DIR = Path.home() / '.hermes' / 'skills'

SKILL_BASES = {
    'local':   PROFILES_DIR,
    'shared':  SHARED_SKILLS_DIR,
    'frontline': FRONTLINE_SKILLS_DIR,
    'worker':  WORKER_SKILLS_DIR,
    'operator': OPERATOR_SKILLS_DIR,
    'primary': PRIMARY_SKILLS_DIR,  # primary == skills-generalist (solo default/ceo)
}

# ── Provenienza skill (dot colorati in dashboard) ────────────────────
# native: skill ufficiali di Hermes Agent (catalogo bundled upstream 28/09/2026:
# docs/reference/skills-catalog — copiate in ~/.hermes/skills/ all'install).
# NOTA: il blocco metadata.hermes nel frontmatter NON indica provenienza
# upstream (lo hanno anche skill nostre) — non usarlo per classificare.
# external: scaricate da fuori (author esterno o lista candidati verificata con l'utente).
# ours: tutto il resto (default).
NATIVE_SKILLS = {
    'apple-notes', 'apple-reminders', 'findmy', 'imessage',
    'claude-code', 'codex', 'computer-use', 'hermes-agent', 'opencode',
    'architecture-diagram', 'ascii-video', 'baoyu-infographic', 'claude-design',
    'design-md', 'humanizer', 'manim-video', 'p5js', 'popular-web-designs',
    'songwriting-and-ai-music',
    'sdlc-review',
    'email-inbox-triage', 'himalaya',
    'gif-search', 'songsee', 'youtube-content',
    'obsidian',
    'airtable', 'box', 'document-to-action-items', 'docx', 'google-workspace',
    'maps', 'meeting-action-items', 'notion', 'pdf', 'powerpoint',
    'product-price-monitor', 'teams-meeting-pipeline', 'weekly-review-planning',
    'xlsx',
    'arxiv', 'competitor-news-monitor', 'grounded-citations', 'llm-wiki',
    'xurl',
    'codebase-inspection', 'dogfood', 'github', 'hermes-agent-skill-authoring',
    'inspecting-hermes-desktop-dom', 'node-inspect-debugger', 'python-debugpy',
    'requesting-code-review', 'simplify-code', 'spike', 'systematic-debugging',
    'test-driven-development',
    'blocked-page-recovery',
}
EXTERNAL_SKILLS = {
    # Firmate (campo author esterno)
    'seo', 'seo-audit', 'seo-page', 'seo-schema', 'seo-sitemap',
    'seo-content-brief', 'lean-startup', 'frontend-design', 'shadcn',
    'web-design-guidelines',
    # Non firmate ma stile esterno (verificate con l'utente 28/09/2026)
    'mktg-ai-seo', 'mktg-copywriting', 'mktg-cro', 'mktg-marketing-psychology',
    'mktg-product-marketing', 'mktg-seo-audit', 'mktg-social', 'marketing-ideas',
    'baoyu-article-illustrator',  # author JimLiu (github.com/JimLiu/baoyu-skills)
    'grill-me-with-docs',  # deriva da mattpocock/skills (grilling) via upstream optional grill-me
    'eli5-succinct', 'summary',  # importate identiche da ~/.agents (non scritte qui)
}

# ── Fonte delle skill scaricate (riga "Fonte:" nel modal) ────────────
# Solo URL verificati (HTTP 200 + titolo giusto). Senza URL: solo author.
EXTERNAL_SOURCES = {
    'mktg-ai-seo': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/ai-seo'),
    'mktg-copywriting': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/copywriting'),
    'mktg-cro': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/cro'),
    'mktg-marketing-psychology': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/marketing-psychology'),
    'mktg-product-marketing': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/product-marketing'),
    'mktg-seo-audit': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/seo-audit'),
    'mktg-social': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/social'),
    'marketing-ideas': ('Corey Haines', 'https://www.skills.sh/coreyhaines31/marketingskills/marketing-ideas'),
    'grill-me-with-docs': ('Matt Pocock', 'https://www.skills.sh/mattpocock/skills/grill-me'),
    'frontend-design': ('Anthropic', 'https://www.skills.sh/anthropics/skills/frontend-design'),
    'web-design-guidelines': ('Vercel', 'https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines'),
    'baoyu-article-illustrator': ('JimLiu', 'https://github.com/JimLiu/baoyu-skills#baoyu-article-illustrator'),
    'seo': ('AgriciDaniel', 'https://www.skills.sh/agricidaniel/claude-seo/seo'),
    'seo-audit': ('AgriciDaniel', 'https://www.skills.sh/agricidaniel/claude-seo/seo-audit'),
    'seo-page': ('AgriciDaniel', 'https://www.skills.sh/agricidaniel/claude-seo/seo-page'),
    'seo-schema': ('AgriciDaniel', 'https://www.skills.sh/agricidaniel/claude-seo/seo-schema'),
    'seo-sitemap': ('AgriciDaniel', 'https://www.skills.sh/agricidaniel/claude-seo/seo-sitemap'),
    'seo-content-brief': ('puneetindersingh', 'https://www.skills.sh/agricidaniel/claude-seo/seo-content-brief'),
    'lean-startup': ('wondelai', 'https://www.skills.sh/wondelai/skills/lean-startup'),
    'shadcn': ('shadcn-ui', 'https://ui.shadcn.com/docs/skills'),
    'eli5-succinct': ('isas1', 'https://www.skills.sh/isas1/skills/eli5-succinct'),
    'summary': ('isas1', 'https://www.skills.sh/isas1/skills/summary'),
}


def _provenance(skill_name: str) -> str:
    if skill_name in NATIVE_SKILLS:
        return 'native'
    if skill_name in EXTERNAL_SKILLS:
        return 'external'
    return 'ours'


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
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response


# ── Lettura gateway_state (condivisa dai loader profili) ──────────
def _read_gateway(gw_path: Path) -> tuple[str, list]:
    """Legge gateway_state.json; PID morto → stopped. Torna (stato, piattaforme)."""
    gateway = 'unknown'
    platforms: list = []
    if gw_path.is_file():
        try:
            with open(gw_path) as f:
                gw = json.load(f)
            gw_state = gw.get('gateway_state', 'unknown')
            gw_pid = gw.get('pid')
            platforms_raw = gw.get('platforms', {})
            # Se PID presente ma processo morto → stato fittizio
            if gw_pid and not _pid_is_alive(gw_pid):
                gw_state = 'stopped'
                platforms_raw = {}
            gateway = gw_state
            # Filtra sotto-agent (chiavi con ':') e api_server interna — solo chat reali
            platforms = sorted(
                p for p, v in platforms_raw.items()
                if isinstance(v, dict) and v.get('state') == 'connected'
                and ':' not in p and p != 'api_server'
            )
        except (json.JSONDecodeError, OSError):
            pass
    return gateway, platforms


# ── Helpers per skill ──────────────────────────────────────────────
def _scan_skills(scan_dir: Path) -> tuple[set[str], set[str], dict[str, str], dict[str, str]]:
    """Unica passata rglob: nomi, categorie, mappa skill→categoria, descrizioni.

    Gestisce layout flat (<skill>/SKILL.md) e categorizzato (<cat>/<skill>/SKILL.md).
    """
    names: set[str] = set()
    categories: set[str] = set()
    name_to_cat: dict[str, str] = {}
    descriptions: dict[str, str] = {}
    if not scan_dir.is_dir():
        return names, categories, name_to_cat, descriptions
    for sf in sorted(scan_dir.rglob('SKILL.md')):
        rel = sf.relative_to(scan_dir)
        parts = rel.parts
        if any(p.startswith('.') for p in parts):
            continue  # .archive/.hub/.git: Hermes non le carica (_SCAN_SKIP_PARTS)
        if len(parts) == 2:
            skill_name, cat = parts[0], ''
        elif len(parts) == 3:
            cat, skill_name = parts[0], parts[1]
            categories.add(cat)
        else:
            continue  # reference/scripts in sottodir — ignora
        names.add(skill_name)
        if skill_name not in name_to_cat:
            name_to_cat[skill_name] = cat
        if skill_name not in descriptions:
            try:
                with open(sf) as f:
                    content = f.read(4096).lstrip('﻿')
                if content.startswith('---'):
                    end_idx = content.find('---', 3)
                    if end_idx != -1:
                        fm = yaml.safe_load(content[3:end_idx])
                        if isinstance(fm, dict) and fm.get('description'):
                            descriptions[skill_name] = str(fm['description']).strip()
            except (OSError, UnicodeDecodeError, yaml.YAMLError):
                pass
    return names, categories, name_to_cat, descriptions


def _build_skill_lists(
    local_names: set[str],
    shared_names: set[str],
    primary_names: set[str] | None = None,
    local_categories: set[str] | None = None,
    shared_categories: set[str] | None = None,
    primary_categories: set[str] | None = None,
    usage: dict | None = None,
    descriptions: dict[str, str] | None = None,
    local_cat_map: dict[str, str] | None = None,
    shared_cat_map: dict[str, str] | None = None,
    primary_cat_map: dict[str, str] | None = None,
    frontline_names: set[str] | None = None,
    frontline_categories: set[str] | None = None,
    frontline_cat_map: dict[str, str] | None = None,
    worker_names: set[str] | None = None,
    worker_categories: set[str] | None = None,
    worker_cat_map: dict[str, str] | None = None,
    operator_names: set[str] | None = None,
    operator_categories: set[str] | None = None,
    operator_cat_map: dict[str, str] | None = None,
    own_usage: dict | None = None,
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
    if local_cat_map is None:
        local_cat_map = {}
    if shared_cat_map is None:
        shared_cat_map = {}
    if primary_cat_map is None:
        primary_cat_map = {}
    if frontline_names is None:
        frontline_names = set()
    if frontline_categories is None:
        frontline_categories = set()
    if frontline_cat_map is None:
        frontline_cat_map = {}
    if worker_names is None:
        worker_names = set()
    if worker_categories is None:
        worker_categories = set()
    if worker_cat_map is None:
        worker_cat_map = {}
    if operator_names is None:
        operator_names = set()
    if operator_categories is None:
        operator_categories = set()
    if operator_cat_map is None:
        operator_cat_map = {}

    # Precedenza: local > primary > frontline > worker > operator > shared
    shared_names = shared_names - local_names
    if primary_names:
        primary_names = primary_names - local_names
        shared_names = shared_names - primary_names
    if frontline_names:
        frontline_names = frontline_names - local_names - (primary_names or set())
        shared_names = shared_names - frontline_names
    if worker_names:
        worker_names = worker_names - local_names - (primary_names or set()) - (frontline_names or set())
        shared_names = shared_names - worker_names
    if operator_names:
        operator_names = operator_names - local_names - (primary_names or set()) - (frontline_names or set()) - (worker_names or set())
        shared_names = shared_names - operator_names

    local_skills: dict[str, dict] = {}
    shared_skills: dict[str, dict] = {}
    primary_skills: dict[str, dict] = {}
    frontline_skills: dict[str, dict] = {}
    worker_skills: dict[str, dict] = {}
    operator_skills: dict[str, dict] = {}
    all_categories: set[str] = set(local_categories) | set(shared_categories) | set(primary_categories) | set(frontline_categories) | set(worker_categories) | set(operator_categories)

    def _build_skill_obj(skill_name, u, category):
        src = EXTERNAL_SOURCES.get(skill_name)
        return {
            'name': skill_name,
            'category': category,
            'provenance': _provenance(skill_name),
            'source': {'author': src[0], 'url': src[1]} if src else None,
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
    # ponytail: stale mostra i conteggi reali; solo archived si nasconde.
    # I locali usano own_usage (per-profilo), i bundle il merge globale.
    own_norm: dict | None = None
    if own_usage is not None:
        own_norm = {}
        for ok, ou in own_usage.items():
            if not isinstance(ou, dict) or ou.get('state') == 'archived':
                continue
            base = ok.split('/')[-1]
            if base not in own_norm or ou.get('use_count', 0) > own_norm[base].get('use_count', 0):
                own_norm[base] = ou
    for usage_key, u in usage.items():
        if not isinstance(u, dict) or u.get('state') == 'archived':
            continue
        if '/' in usage_key:
            cat, skill_name = usage_key.split('/', 1)
            all_categories.add(cat)
        else:
            cat = None
            skill_name = usage_key

        if skill_name in local_names and own_norm is not None:
            u = own_norm.get(skill_name, u)

        if skill_name in local_names:
            _merge(local_skills, skill_name, u, cat)
        elif primary_names and skill_name in primary_names:
            _merge(primary_skills, skill_name, u, cat)
        elif frontline_names and skill_name in frontline_names:
            _merge(frontline_skills, skill_name, u, cat)
        elif worker_names and skill_name in worker_names:
            _merge(worker_skills, skill_name, u, cat)
        elif operator_names and skill_name in operator_names:
            _merge(operator_skills, skill_name, u, cat)
        elif skill_name in shared_names:
            _merge(shared_skills, skill_name, u, cat)
        # Orphan: usage data without SKILL.md on disk → skip (was deleted)

    # ── Second pass: skills from directory scan (never used — use_count=0) ──
    for skill_name in sorted(local_names):
        if skill_name not in local_skills:
            local_skills[skill_name] = _build_skill_obj(skill_name, None, local_cat_map.get(skill_name))
    if primary_names:
        for skill_name in sorted(primary_names):
            if skill_name not in primary_skills:
                primary_skills[skill_name] = _build_skill_obj(skill_name, None, primary_cat_map.get(skill_name))
    if frontline_names:
        for skill_name in sorted(frontline_names):
            if skill_name not in frontline_skills:
                frontline_skills[skill_name] = _build_skill_obj(skill_name, None, frontline_cat_map.get(skill_name))
    if worker_names:
        for skill_name in sorted(worker_names):
            if skill_name not in worker_skills:
                worker_skills[skill_name] = _build_skill_obj(skill_name, None, worker_cat_map.get(skill_name))
    if operator_names:
        for skill_name in sorted(operator_names):
            if skill_name not in operator_skills:
                operator_skills[skill_name] = _build_skill_obj(skill_name, None, operator_cat_map.get(skill_name))
    for skill_name in sorted(shared_names):
        if skill_name not in shared_skills:
            shared_skills[skill_name] = _build_skill_obj(skill_name, None, shared_cat_map.get(skill_name))

    # ── Third pass: fill missing categories from directory scan maps ──
    # Skills with usage data may have flat keys (no category prefix) even when
    # they live in a category subdirectory. Override category from scan maps.
    for sk_map, target in [(local_cat_map, local_skills), (primary_cat_map, primary_skills), (frontline_cat_map, frontline_skills), (worker_cat_map, worker_skills), (operator_cat_map, operator_skills), (shared_cat_map, shared_skills)]:
        for skill_name, cat in sk_map.items():
            if cat and skill_name in target and not target[skill_name].get('category'):
                target[skill_name]['category'] = cat

    # ── Sort all lists ──
    local_sorted = sorted(local_skills.values(), key=lambda s: s['use_count'], reverse=True)
    primary_sorted = sorted(primary_skills.values(), key=lambda s: s['use_count'], reverse=True)
    frontline_sorted = sorted(frontline_skills.values(), key=lambda s: s['use_count'], reverse=True)
    worker_sorted = sorted(worker_skills.values(), key=lambda s: s['use_count'], reverse=True)
    operator_sorted = sorted(operator_skills.values(), key=lambda s: s['use_count'], reverse=True)
    shared_sorted = sorted(shared_skills.values(), key=lambda s: s['use_count'], reverse=True)

    # ── Combined list for legacy fields ──
    all_known = list(local_skills.values()) + list(primary_skills.values()) + list(frontline_skills.values()) + list(worker_skills.values()) + list(operator_skills.values()) + list(shared_skills.values())
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
        'total': len(local_sorted) + len(shared_sorted) + len(primary_sorted) + len(frontline_sorted) + len(worker_sorted) + len(operator_sorted),
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

    # Add frontline section only when there are frontline skills
    if frontline_names:
        result['frontline'] = {
            'total': len(frontline_sorted),
            'categories': sorted(frontline_categories),
            'list': list(frontline_sorted),
        }
    else:
        result['frontline'] = None

    # Add worker section only when there are worker skills
    if worker_names:
        result['worker'] = {
            'total': len(worker_sorted),
            'categories': sorted(worker_categories),
            'list': list(worker_sorted),
        }
    else:
        result['worker'] = None

    # Add operator section only when there are operator skills
    if operator_names:
        result['operator'] = {
            'total': len(operator_sorted),
            'categories': sorted(operator_categories),
            'list': list(operator_sorted),
        }
    else:
        result['operator'] = None

    return result


# ── Skill per profilo ──────────────────────────────────────────────
def _merged_usage() -> dict:
    """Somma di tutti gli .usage.json (global + profili), skip archived.

    ponytail: i conteggi seguono la skill ovunque sia (anche dopo uno
    spostamento di cartella); un solo punto di merge invece di N fix
    per-profilo nel frontend.
    """
    merged: dict = {}
    files = [GLOBAL_SKILLS_DIR / '.usage.json']
    if PROFILES_DIR.is_dir():
        files += [e / 'skills' / '.usage.json' for e in PROFILES_DIR.iterdir() if e.is_dir()]
    for fp in files:
        try:
            with open(fp) as f:
                loaded = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(loaded, dict):
            continue
        for k, u in loaded.items():
            if not isinstance(u, dict) or u.get('state') == 'archived':
                continue
            # 'cat/skill' e 'skill' sono la stessa skill: normalizza
            base = k.split('/')[-1]
            cur = merged.get(base)
            if cur is None:
                merged[base] = dict(u)
            else:
                for field in ('use_count', 'view_count', 'patch_count'):
                    cur[field] = cur.get(field, 0) + u.get(field, 0)
                for ts in ('last_used_at', 'last_viewed_at', 'last_patched_at', 'created_at'):
                    a, b = cur.get(ts), u.get(ts)
                    if b and (not a or b > a):
                        cur[ts] = b
    return merged


def _load_profile_skills(name: str) -> dict | None:
    """Legge le skill installate per un profilo, separate in locali, condivise, frontline, worker, operator e primarie.

    Locali: skills/ del profilo. Condivise/frontline/worker/operator/primarie: external_dirs dal config.yaml
    (frontline = skills-frontline, worker = skills-worker, operator = skills-operators, primarie = skills-generalist).
    """
    skills_dir = PROFILES_DIR / name / 'skills'

    # Legge external_dirs dal config.yaml del profilo
    config_path = PROFILES_DIR / name / 'config.yaml'
    external_dirs: list[Path] = []
    if config_path.is_file():
        try:
            with open(config_path) as f:
                cfg = yaml.safe_load(f)
        except (OSError, UnicodeDecodeError, yaml.YAMLError):
            cfg = None
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
        try:
            with open(usage_path) as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                usage = loaded
        except (OSError, json.JSONDecodeError):
            pass

    # Scansiona directory locali (unica passata: nomi + descrizioni)
    local_names, local_categories, local_cat_map, desc_local = _scan_skills(skills_dir)

    # Separa directory primarie/frontline/worker/operator da quelle condivise
    primary_dirs: list[Path] = []
    frontline_dirs: list[Path] = []
    worker_dirs: list[Path] = []
    operator_dirs: list[Path] = []
    shared_dirs: list[Path] = []
    primary_ref = PRIMARY_SKILLS_DIR.resolve()
    try:
        frontline_ref = FRONTLINE_SKILLS_DIR.resolve()
    except OSError:
        frontline_ref = None
    try:
        worker_ref = WORKER_SKILLS_DIR.resolve()
    except OSError:
        worker_ref = None
    try:
        operator_ref = OPERATOR_SKILLS_DIR.resolve()
    except OSError:
        operator_ref = None
    prof_base = PROFILES_DIR.resolve()
    for d in external_dirs:
        rd = d.resolve()
        # Locali di altri profili (es. coder, researcher per il ceo): lette a
        # runtime, ma mostrate nelle loro sezioni — non in shared (cfr. default).
        if rd.name == 'skills' and rd.parent.parent == prof_base:
            continue
        if rd == primary_ref:
            primary_dirs.append(d)
        elif frontline_ref is not None and rd == frontline_ref:
            frontline_dirs.append(d)
        elif worker_ref is not None and rd == worker_ref:
            worker_dirs.append(d)
        elif operator_ref is not None and rd == operator_ref:
            operator_dirs.append(d)
        else:
            shared_dirs.append(d)

    # Scansiona directory condivise (non-primary) — unica passata
    shared_names: set[str] = set()
    shared_categories: set[str] = set()
    shared_cat_map: dict[str, str] = {}
    desc_shared: dict[str, str] = {}
    for ext_dir in shared_dirs:
        sn, sc, scm, desc = _scan_skills(ext_dir)
        shared_names |= sn
        shared_categories |= sc
        for k, v in scm.items():
            shared_cat_map.setdefault(k, v)
        for k, v in desc.items():
            desc_shared.setdefault(k, v)

    # Scansiona directory primarie — unica passata
    primary_names: set[str] = set()
    primary_categories: set[str] = set()
    primary_cat_map: dict[str, str] = {}
    desc_primary: dict[str, str] = {}
    for prim_dir in primary_dirs:
        sn, sc, scm, desc = _scan_skills(prim_dir)
        primary_names |= sn
        primary_categories |= sc
        for k, v in scm.items():
            primary_cat_map.setdefault(k, v)
        for k, v in desc.items():
            desc_primary.setdefault(k, v)

    # Scansiona directory frontline — unica passata
    frontline_names: set[str] = set()
    frontline_categories: set[str] = set()
    frontline_cat_map: dict[str, str] = {}
    desc_frontline: dict[str, str] = {}
    for fl_dir in frontline_dirs:
        sn, sc, scm, desc = _scan_skills(fl_dir)
        frontline_names |= sn
        frontline_categories |= sc
        for k, v in scm.items():
            frontline_cat_map.setdefault(k, v)
        for k, v in desc.items():
            desc_frontline.setdefault(k, v)

    # Scansiona directory worker — unica passata
    worker_names: set[str] = set()
    worker_categories: set[str] = set()
    worker_cat_map: dict[str, str] = {}
    desc_worker: dict[str, str] = {}
    for w_dir in worker_dirs:
        sn, sc, scm, desc = _scan_skills(w_dir)
        worker_names |= sn
        worker_categories |= sc
        for k, v in scm.items():
            worker_cat_map.setdefault(k, v)
        for k, v in desc.items():
            desc_worker.setdefault(k, v)

    # Scansiona directory operator — unica passata
    operator_names: set[str] = set()
    operator_categories: set[str] = set()
    operator_cat_map: dict[str, str] = {}
    desc_operator: dict[str, str] = {}
    for op_dir in operator_dirs:
        sn, sc, scm, desc = _scan_skills(op_dir)
        operator_names |= sn
        operator_categories |= sc
        for k, v in scm.items():
            operator_cat_map.setdefault(k, v)
        for k, v in desc.items():
            desc_operator.setdefault(k, v)

    # Merge descriptions: shared < operator < worker < frontline < primary < local
    merged_desc: dict[str, str] = {}
    merged_desc.update(desc_shared)
    merged_desc.update(desc_operator)
    merged_desc.update(desc_worker)
    merged_desc.update(desc_frontline)
    merged_desc.update(desc_primary)
    merged_desc.update(desc_local)

    # Bundle condivisi: conteggi dal merge globale; locali: solo propri
    own_usage = usage
    usage = _merged_usage()

    return _build_skill_lists(
        local_names, shared_names, primary_names,
        local_categories, shared_categories, primary_categories,
        usage, merged_desc,
        local_cat_map, shared_cat_map, primary_cat_map,
        frontline_names, frontline_categories, frontline_cat_map,
        worker_names, worker_categories, worker_cat_map,
        operator_names, operator_categories, operator_cat_map,
        own_usage=own_usage,
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
        try:
            with open(config_path) as f:
                cfg = yaml.safe_load(f)
        except (OSError, UnicodeDecodeError, yaml.YAMLError):
            cfg = None
        if isinstance(cfg, dict):
            mc = cfg.get('model', {})
            if isinstance(mc, dict):
                info['model'] = mc.get('default')
                info['provider'] = mc.get('provider')

    # Ignora profili senza model.default
    if not info['model']:
        return None

    # Legge gateway_state.json (helper condiviso, filtra sotto-agent)
    info['gateway'], info['platforms'] = _read_gateway(gateway_path)

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

    try:
        with open(config_path) as f:
            cfg = yaml.safe_load(f)
    except (OSError, UnicodeDecodeError, yaml.YAMLError):
        return None

    if not isinstance(cfg, dict):
        return None

    mc = cfg.get('model', {})
    model = mc.get('default') if isinstance(mc, dict) else None
    provider = mc.get('provider') if isinstance(mc, dict) else None

    # Skill locali / condivise / primarie / frontline / worker / operator — unica passata rglob ciascuna
    # Locali di default = solo ~/.hermes/skills/ (quelle di coder/researcher
    # restano nelle loro sezioni; la tabella Chi-legge-cosa documenta l'eccezione).
    local_names, local_categories, local_cat_map, desc_local = _scan_skills(GLOBAL_SKILLS_DIR)
    shared_names, shared_categories, shared_cat_map, desc_shared = _scan_skills(SHARED_SKILLS_DIR)
    frontline_names, frontline_categories, frontline_cat_map, desc_frontline = _scan_skills(FRONTLINE_SKILLS_DIR)
    worker_names, worker_categories, worker_cat_map, desc_worker = _scan_skills(WORKER_SKILLS_DIR)
    operator_names, operator_categories, operator_cat_map, desc_operator = _scan_skills(OPERATOR_SKILLS_DIR)
    primary_names, primary_categories, primary_cat_map, desc_primary = _scan_skills(PRIMARY_SKILLS_DIR)
    merged_desc: dict[str, str] = {}
    merged_desc.update(desc_shared)
    merged_desc.update(desc_operator)
    merged_desc.update(desc_worker)
    merged_desc.update(desc_frontline)
    merged_desc.update(desc_primary)
    merged_desc.update(desc_local)

    # Carica usage data dal global skills dir
    usage: dict = {}
    usage_path = GLOBAL_SKILLS_DIR / '.usage.json'
    if usage_path.is_file():
        try:
            with open(usage_path) as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                usage = loaded
        except (OSError, json.JSONDecodeError):
            pass

    skills = _build_skill_lists(local_names, shared_names, primary_names, local_categories, shared_categories, primary_categories, _merged_usage(), merged_desc, local_cat_map, shared_cat_map, primary_cat_map, frontline_names, frontline_categories, frontline_cat_map, worker_names, worker_categories, worker_cat_map, operator_names, operator_categories, operator_cat_map, own_usage=usage)

    # Legge gateway_state.json della root (helper condiviso)
    gateway, platforms = _read_gateway(Path.home() / '.hermes' / 'gateway_state.json')

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
            'SELECT id, title, status, assignee, '
            '  last_heartbeat_at, model_override, '
            '  created_at, started_at, priority, current_run_id '
            'FROM tasks WHERE status != ? ORDER BY created_at DESC',
            ('archived',)
        )
        tasks = [dict(r) for r in cur.fetchall()]

        # ── 3 query aggregate invece di 3×N (ponytail: O(tasks), non O(tasks×eventi)) ──
        cur.execute(
            "SELECT task_id, COUNT(*) as cnt FROM task_events "
            "WHERE kind='heartbeat' GROUP BY task_id"
        )
        hb_counts = {r['task_id']: r['cnt'] for r in cur.fetchall()}

        # Ultima nota heartbeat per task (ORDER+Dedup in Python: il payload
        # della riga MAX non è selezionabile con GROUP BY in modo portabile)
        cur.execute(
            "SELECT task_id, payload FROM task_events "
            "WHERE kind='heartbeat' ORDER BY created_at DESC"
        )
        hb_notes: dict = {}
        for r in cur.fetchall():
            tid = r['task_id']
            if tid in hb_notes or not r['payload']:
                continue
            try:
                payload = json.loads(r['payload'])
                note = payload.get('note') if isinstance(payload, dict) else None
                if note and isinstance(note, str) and note.strip():
                    hb_notes[tid] = note.strip()
                else:
                    hb_notes[tid] = None  # visto: nessun'altra riga da provare
            except (json.JSONDecodeError, TypeError):
                continue

        # used_opencode dal metadata del run più recente per task
        cur.execute(
            'SELECT task_id, metadata FROM task_runs '
            'WHERE metadata IS NOT NULL AND metadata != "" '
            'ORDER BY started_at DESC'
        )
        oc_map: dict = {}
        for r in cur.fetchall():
            tid = r['task_id']
            if tid in oc_map:
                continue
            try:
                meta = json.loads(r['metadata'])
                if isinstance(meta, dict) and 'used_opencode' in meta:
                    oc_map[tid] = meta['used_opencode']
            except (json.JSONDecodeError, TypeError):
                continue
        conn.close()

        for t in tasks:
            t['heartbeat_count'] = hb_counts.get(t['id'], 0)
            if t['id'] in hb_notes and hb_notes[t['id']]:
                t['last_heartbeat_note'] = hb_notes[t['id']]
            if t['id'] in oc_map:
                t['used_opencode'] = oc_map[t['id']]
        return tasks
    except sqlite3.Error:
        return []


# ── Health-check helper ────────────────────────────────────────
def _get_profile_health() -> dict[str, str]:
    """Legge health dalla cache (senza testare). Torna {name: 'ok'/'error'/'unknown'}."""
    cache = health_check._read_cache()
    if cache:
        return cache.get('profiles', {})
    return {}


# ── Risposte JSON con ETag (304 Not Modified) ────────────────────
def _etag_response(payload: dict | list) -> Response:
    """Serializza payload come JSON con header ETag.

    L'ETag è calcolato sul contenuto escluso `_ts`, così il frontend
    riceve 304 quando i dati reali non sono cambiati. Il client deve
    inviare `If-None-Match` con l'ETag precedente.
    """
    if isinstance(payload, dict):
        etag_src = {k: v for k, v in payload.items() if k != '_ts'}
    else:
        etag_src = payload
    etag = hashlib.md5(
        json.dumps(etag_src, sort_keys=True, default=str).encode()
    ).hexdigest()
    if request.headers.get('If-None-Match') == etag:
        return Response(status=304)
    body = json.dumps(payload, sort_keys=True, default=str)
    return Response(body, mimetype='application/json', headers={'ETag': etag})


# ── Endpoint ───────────────────────────────────────────────────────
@app.route('/api/status')
def api_status():
    """GET /api/status → JSON con profili, task kanban e health.

    Cache in-memory 10s + ETag (304 se invariato) + `_ts` per il badge
    "dati vecchi di X" del frontend.
    """
    now = time.time()
    if _STATUS_CACHE['payload'] is not None and now - _STATUS_CACHE['ts'] < STATUS_CACHE_TTL:
        return _etag_response(_STATUS_CACHE['payload'])

    start = time.monotonic()
    profiles = load_profiles()
    health_map = _get_profile_health()
    for p in profiles:
        p['health'] = health_map.get(p['name'], 'unknown')
    payload = {
        'profiles': profiles,
        'kanban': load_kanban(),
        '_ts': now,
    }
    elapsed = time.monotonic() - start
    if elapsed > 1.0:
        log.warning('api_status recompute lento: %.2fs (%d profili)', elapsed, len(profiles))
    _STATUS_CACHE['ts'] = now
    _STATUS_CACHE['payload'] = payload
    return _etag_response(payload)


@app.route('/api/health')
def api_health():
    """GET /api/health → JSON con health-check dei provider.
       GET /api/health?force=1 → ignora cache, rifà i test.
    """
    force = request.args.get('force', '').lower() in ('1', 'true', 'yes')
    return _etag_response(health_check.run(force=force))


@app.route('/api/credits')
def api_credits():
    """GET /api/credits → JSON con crediti API Tavily/Exa.
       GET /api/credits?force=1 → ignora cache, rifà le chiamate.
    """
    force = request.args.get('force', '').lower() in ('1', 'true')
    return _etag_response(credit_check.run(force=force))


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


@app.route('/api/skills/<profile_name>/delete', methods=['POST'])
def api_skill_delete(profile_name):
    """POST /api/skills/<profile_name>/delete
    Body JSON: {"name": "skill-name", "type": "local|shared|frontline|primary"}
    Cancella la skill (locale, condivisa, frontline o primaria).
    """
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({'deleted': False, 'error': 'JSON richiesto'}), 400
    
    skill_name = data.get('name') if isinstance(data, dict) else None
    category = data.get('category', '').strip() if isinstance(data, dict) else ''
    skill_type = data.get('type', 'local') if isinstance(data, dict) else 'local'

    if not skill_name or not isinstance(skill_name, str) or not skill_name.strip():
        return jsonify({'deleted': False, 'error': 'Campo "name" mancante o non valido'}), 400

    if skill_type not in SKILL_BASES:
        return jsonify({'deleted': False, 'error': f'Tipo skill non valido: {skill_type}'}), 400

    skill_name = skill_name.strip()

    if skill_type == 'local':
        # 'default' è virtuale: skill locali in ~/.hermes/skills/, non in profiles/default/
        if profile_name == 'default':
            base_dir = GLOBAL_SKILLS_DIR
        else:
            base_dir = PROFILES_DIR / profile_name / 'skills'
        usage_files = [base_dir / '.usage.json']
    else:
        base_dir = SKILL_BASES[skill_type]
        # Shared/primary: spazza gli usage di default + tutti i profili
        usage_files = [GLOBAL_SKILLS_DIR / '.usage.json']
        if PROFILES_DIR.is_dir():
            usage_files += [
                e / 'skills' / '.usage.json'
                for e in PROFILES_DIR.iterdir() if e.is_dir()
            ]

    if category:
        skill_dir = base_dir / category / skill_name
        if not skill_dir.is_dir():
            skill_dir = base_dir / skill_name
    else:
        skill_dir = base_dir / skill_name

    if not skill_dir.is_dir():
        return jsonify({
            'deleted': False,
            'error': f'Skill "{skill_name}" non trovata in {base_dir}',
        }), 404

    try:
        shutil.rmtree(str(skill_dir))
    except OSError as e:
        return jsonify({'deleted': False, 'error': f'Errore cancellazione: {e}'}), 500

    # Pulizia usage: toglie la skill da tutti i file coinvolti (niente orfani)
    for usage_path in usage_files:
        if usage_path.is_file():
            try:
                with open(usage_path) as f:
                    usage = json.load(f)
                changed = False
                if skill_name in usage:
                    del usage[skill_name]
                    changed = True
                for key in list(usage.keys()):
                    if key.endswith('/' + skill_name) or key == skill_name:
                        del usage[key]
                        changed = True
                if changed:
                    with open(usage_path, 'w') as f:
                        json.dump(usage, f, indent=2)
            except (OSError, json.JSONDecodeError):
                pass

    return jsonify({
        'deleted': True,
        'type': skill_type,
        'skill': skill_name,
        'path': str(skill_dir),
    })


@app.route('/api/opencode-usage')
def api_opencode_usage():
    """GET /api/opencode-usage → JSON con usage OpenCode (1 account).
       GET /api/opencode-usage?force=1 → ignora cache.
    """
    force = request.args.get('force', '').lower() in ('1', 'true')
    return _etag_response(opencode_usage_scraper.run(force=force))


@app.route('/')
def index():
    return app.send_static_file('index.html')



@app.route('/api/kanban/archive/<task_id>', methods=['POST'])
def api_kanban_archive(task_id):
    """POST /api/kanban/archive/<task_id> — archive a kanban task."""
    try:
        conn = sqlite3.connect(str(KANBAN_DB))
        cur = conn.cursor()
        cur.execute('UPDATE tasks SET status = ? WHERE id = ?', ('archived', task_id))
        conn.commit()
        affected = cur.rowcount
        conn.close()
        if affected == 0:
            return jsonify({'archived': False, 'task_id': task_id, 'error': 'task not found'}), 404
        return jsonify({'archived': True, 'task_id': task_id})
    except sqlite3.Error as e:
        return jsonify({'archived': False, 'task_id': task_id, 'error': str(e)}), 500


@app.route('/api/kanban/unarchive/<task_id>', methods=['POST'])
def api_kanban_unarchive(task_id):
    """POST /api/kanban/unarchive/<task_id> — rimette un task archiviato in done."""
    try:
        conn = sqlite3.connect(str(KANBAN_DB))
        cur = conn.cursor()
        cur.execute(
            'UPDATE tasks SET status = ? WHERE id = ? AND status = ?',
            ('done', task_id, 'archived')
        )
        conn.commit()
        affected = cur.rowcount
        conn.close()
        if affected == 0:
            return jsonify({'unarchived': False, 'task_id': task_id, 'error': 'task not found o non archiviato'}), 404
        return jsonify({'unarchived': True, 'task_id': task_id})
    except sqlite3.Error as e:
        return jsonify({'unarchived': False, 'task_id': task_id, 'error': str(e)}), 500


@app.route('/api/kanban/<task_id>/heartbeats')
def api_kanban_heartbeats(task_id):
    """GET /api/kanban/<task_id>/heartbeats → heartbeat events di un task."""
    try:
        conn = sqlite3.connect(str(KANBAN_DB))
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cur.execute(
            'SELECT COUNT(*) as cnt FROM task_events '
            'WHERE task_id=? AND kind=?',
            (task_id, 'heartbeat')
        )
        total = cur.fetchone()['cnt']

        cur.execute(
            'SELECT id, run_id, payload, created_at '
            'FROM task_events '
            'WHERE task_id=? AND kind=? '
            'ORDER BY created_at DESC',
            (task_id, 'heartbeat')
        )
        rows = cur.fetchall()
        conn.close()

        heartbeats = []
        for r in rows:
            note = None
            try:
                payload = json.loads(r['payload'])
                note = payload.get('note') if isinstance(payload, dict) else None
            except (json.JSONDecodeError, TypeError):
                pass
            heartbeats.append({
                'id': r['id'],
                'run_id': r['run_id'],
                'note': note,
                'created_at': r['created_at'],
            })

        return jsonify({
            'task_id': task_id,
            'total': total,
            'heartbeats': heartbeats,
        })
    except sqlite3.Error as e:
        return jsonify({'error': str(e)}), 500


# ── Main ───────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5151)
