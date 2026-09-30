    // ── skills.js — profili, skill locali/condivise/primarie ──
    import { esc, sortProfiles, timeAgo } from './utils.js';
    import { confirmDialog, alertDialog } from './modals.js';

    // Profili espansi (preservati tra i refresh: renderProfiles ricostruisce il tbody)
    const expandedProfiles = new Set();

    // Sotto-sezioni locali chiuse dall'utente (il refresh ricostruisce i <details>)
    const closedLocal = new Set();
    let localFilterHold = false; // filtro attivo: i toggle forzati non toccano il set
    export function setLocalFilterHold(v) { localFilterHold = v; }
    export function restoreLocalDetails() {
      document.querySelectorAll('#skill-local-content details.profile-skills').forEach(det => {
        det.open = !closedLocal.has(det.dataset.profile);
      });
    }

    // ── Errore generico di sezione (con retry) ───────────────────
    export function renderSectionError(container, label, message, retryTarget) {
      container.innerHTML =
        '<div class="section-error">' +
        '<i class="fas fa-triangle-exclamation"></i>' +
        '<span>' + esc(label) + ' non caricate: ' + esc(message) + '</span>' +
        '<button class="retry-btn" data-retry="' + esc(retryTarget) + '"><i class="fas fa-rotate-right"></i> Riprova</button>' +
        '</div>';
    }

    // ── Render Profili ───────────────────────────────────────────
    export function renderProfiles(tbody, profiles) {
      if (!profiles.length) {
        tbody.innerHTML =
          '<tr><td colspan="5">' +
          '<div class="empty-state"><i class="fas fa-users-slash"></i>Nessun profilo configurato</div>' +
          '</td></tr>';
        return;
      }

      const sorted = sortProfiles(profiles);
      tbody.innerHTML = '';
      sorted.forEach(p => {
        const safeName = p.name;

        const hasSkills = p.skills && p.skills.total > 0;
        const totalSkills = p.skills ? p.skills.total : 0;
        const skillBadge = hasSkills
          ? '<span class="skill-badge"><i class="fa-solid fa-puzzle-piece"></i> ' + totalSkills + ' <span class="count">skill</span></span>'
          : '<span class="skill-badge" style="color:#484f58;">&mdash;</span>';

        const expandIcon = hasSkills
          ? '<i class="fa-solid fa-chevron-right expand-icon' + (expandedProfiles.has(safeName) ? ' expanded' : '') + '" data-expand-icon="' + esc(safeName) + '"></i>'
          : '<span class="no-expand"></span>';

        const row = document.createElement('tr');
        row.className = 'profile-row';
        row.dataset.profile = safeName;
        if (hasSkills) {
          row.dataset.expandable = '1';
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
        }
        row.innerHTML =
          '<td data-label="Profilo"><div class="profile-name">' + expandIcon + ' <i class="fa-solid fa-user"></i> ' + esc(safeName) + '</div></td>' +
          '<td data-label="Modello"><span class="model-cell">' + esc(p.model || '-') + '</span></td>' +
          '<td data-label="Provider"><span class="provider-cell">' + esc(p.provider || '-') + '</span></td>' +
          '<td data-label="SOUL/AGENTS" class="soul-agents-cell">' + renderSoulAgents(safeName, p) + '</td>' +
          '<td data-label="Skill">' + skillBadge + '</td>';
        tbody.appendChild(row);

        if (hasSkills) {
          const top5 = (p.skills.top || []).slice(0, 5);
          let skillItems = '';
          top5.forEach(sk => {
            const ago = timeAgo(sk.last_used_at);
            const agoHtml = ago ? '<span class="last-used">' + esc(ago) + '</span>' : '';
            skillItems += '<span class="skill-item">' +
              '<i class="fa-regular fa-star"></i> ' +
              '<span class="name">' + esc(sk.name) + '</span>' +
              ' <span class="count">(' + esc(String(sk.use_count)) + ')</span>' +
              agoHtml +
              '</span>';
          });

          const cats = p.skills.categories || [];
          if (cats.length) {
            skillItems += '<span class="skill-item" style="background:transparent;border-color:transparent;color:#484f58;font-size:11px;">' +
              '<i class="fa-regular fa-folder"></i> ' + esc(cats.join(', ')) +
              '</span>';
          }

          const detail = document.createElement('tr');
          detail.className = 'skill-detail-row';
          detail.id = 'skills-' + safeName;
          // Ripristina espansione precedente (il refresh ricostruisce il tbody)
          detail.style.display = expandedProfiles.has(safeName) ? 'table-row' : 'none';
          detail.innerHTML =
            '<td colspan="5">' +
            '<div class="skill-title"><i class="fa-solid fa-puzzle-piece"></i> Skill</div>' +
            '<div class="skill-list">' + skillItems + '</div>' +
            '</td>';
          tbody.appendChild(detail);
        }
      });
    }

    export function renderProfilesSkeleton(tbody) {
      tbody.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5"><div class="skeleton-line" style="width:60%"></div></td>';
        tbody.appendChild(row);
      }
    }

    export function renderProfilesError(tbody, message) {
      tbody.innerHTML =
        '<tr><td colspan="5">' +
        '<div class="section-error">' +
        '<i class="fas fa-triangle-exclamation"></i>' +
        '<span>Profili non caricati: ' + esc(message) + '</span>' +
        '<button class="retry-btn" data-retry="fast"><i class="fas fa-rotate-right"></i> Riprova</button>' +
        '</div></td></tr>';
    }

    function renderSoulAgents(safeName, p) {
      const soul = p.has_soul
        ? '<span class="soul-badge soul" data-doc="soul" data-profile="' + esc(safeName) + '" title="Mostra SOUL.md"><i class="fa-solid fa-spa"></i> SOUL</span>'
        : '<span class="soul-badge missing" title="SOUL.md assente">&mdash;</span>';
      const agents = p.has_agents
        ? '<span class="soul-badge agents" data-doc="agents" data-profile="' + esc(safeName) + '" title="Mostra AGENTS.md"><i class="fa-solid fa-robot"></i> AGENTS</span>'
        : '<span class="soul-badge missing" title="AGENTS.md assente">&mdash;</span>';
      return soul + agents;
    }

    // ── Toggle riga dettaglio skill ──────────────────────────────
    function toggleSkills(profileName) {
      const detailRow = document.getElementById('skills-' + profileName);
      if (!detailRow) return;
      const isHidden = detailRow.style.display === 'none';
      detailRow.style.display = isHidden ? 'table-row' : 'none';
      if (isHidden) expandedProfiles.add(profileName);
      else expandedProfiles.delete(profileName);
      const expandIcon = document.querySelector('[data-expand-icon="' + CSS.escape(profileName) + '"]');
      if (expandIcon) expandIcon.classList.toggle('expanded', isHidden);
    }

    // ── Cancellazione skill ──────────────────────────────────────
    async function deleteSkill(profileName, skillName, category, skillType, btn, onChanged) {
      if (!await confirmDialog('Cancellare la skill "' + skillName + '"?' +
        (skillType !== 'local' ? '\n\n⚠️ Skill condivisa — visibile a ' + (VISIBILITY[skillType] || 'più profili') + '.' : ''), {
        title: 'Cancellare skill?', okText: 'Cancella', danger: skillType !== 'local',
      })) return;

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      }

      const body = { name: skillName, type: skillType };
      if (category) body.category = category;

      try {
        const resp = await fetch('/api/skills/' + encodeURIComponent(profileName || 'default') + '/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (!data.deleted) {
          await alertDialog('Errore: ' + (data.error || 'cancellazione fallita'));
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
          }
          return;
        }
        await onChanged();
      } catch (err) {
        await alertDialog('Errore: ' + err.message);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        }
      }
    }

    // Visibilità dei bucket condivisi (per il confirm di cancellazione)
    const VISIBILITY = { shared: 'TUTTI i profili', frontline: 'default, ceo e teacher', worker: 'coder e researcher', operator: 'default e coder', primary: 'default e ceo' };

    // ── Calcolo dinamico dello stato delle skill (100% data-driven, zero magic numbers) ──
    function calculateQuantiles(numbers) {
      if (!numbers || !numbers.length) return { q1: 1, med: 2, q3: 7 };
      const sorted = [...numbers].sort((a, b) => a - b);
      const q = (p) => {
        const pos = (sorted.length - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
      };
      return { q1: q(0.25), med: q(0.50), q3: q(0.75) };
    }

    let _activityContext = null;
    let _currentSortMode = localStorage.getItem('hermes_skill_sort') || 'activity';

    export function getSkillSortMode() {
      return _currentSortMode;
    }

    export function setSkillSortMode(mode) {
      _currentSortMode = mode;
      localStorage.setItem('hermes_skill_sort', mode);
    }

    export function updateSkillsActivityContext(profiles) {
      const now = Date.now();
      const allUsed = [];
      const seen = new Set();

      (profiles || []).forEach(p => {
        const psk = p.skills || {};
        ['local', 'shared', 'frontline', 'worker', 'operator', 'primary'].forEach(secKey => {
          const sec = psk[secKey];
          if (sec && Array.isArray(sec.list)) {
            sec.list.forEach(sk => {
              if (!sk || !sk.name || seen.has(sk.name)) return;
              seen.add(sk.name);
              if (sk.use_count > 0 && sk.last_used_at) {
                const usedMs = new Date(sk.last_used_at).getTime();
                const createdMs = sk.created_at ? new Date(sk.created_at).getTime() : usedMs;
                const daysAgo = Math.max(0.01, (now - usedMs) / 86400000);
                const lifetimeDays = Math.max(0.5, (now - createdMs) / 86400000);
                const velocity = sk.use_count / lifetimeDays;
                allUsed.push({ name: sk.name, daysAgo, lifetimeDays, velocity, use_count: sk.use_count });
              }
            });
          }
        });
      });

      if (!allUsed.length) {
        _activityContext = null;
        return;
      }

      const recencyQuantiles = calculateQuantiles(allUsed.map(s => s.daysAgo));
      const ageQuantiles = calculateQuantiles(allUsed.map(s => s.lifetimeDays));
      const velocityQuantiles = calculateQuantiles(allUsed.map(s => s.velocity));

      _activityContext = {
        now,
        recencyQuantiles,
        ageQuantiles,
        velocityQuantiles,
      };
    }

    export function getSkillActivity(sk) {
      if (!sk || sk.use_count === 0 || !sk.last_used_at) {
        return {
          state: 'unused',
          label: 'Mai usata',
          color: '#484f58',
          badge: '',
          score: 0,
          daysAgo: 9999,
          velocity: 0,
        };
      }

      const now = _activityContext ? _activityContext.now : Date.now();
      const usedMs = new Date(sk.last_used_at).getTime();
      const createdMs = sk.created_at ? new Date(sk.created_at).getTime() : usedMs;
      const daysAgo = Math.max(0.01, (now - usedMs) / 86400000);
      const lifetimeDays = Math.max(0.5, (now - createdMs) / 86400000);
      const velocity = sk.use_count / lifetimeDays;

      let velText = '';
      if (velocity >= 1) {
        velText = `${velocity >= 10 ? Math.round(velocity) : velocity.toFixed(1)}/gg`;
      } else if (velocity * 7 >= 1) {
        velText = `${(velocity * 7).toFixed(1)}/sett`;
      }

      const rq = (_activityContext && _activityContext.recencyQuantiles) || { q1: 1, med: 2, q3: 8 };
      const aq = (_activityContext && _activityContext.ageQuantiles) || { q1: 4, med: 10, q3: 70 };

      // Punteggio di calore continuo (0 - 100) basato su recency e frequenza relative
      const recencyFactor = 1 / (1 + daysAgo / Math.max(0.1, rq.med));
      const velocityFactor = Math.min(1, velocity / 2);
      const score = Math.round((recencyFactor * 0.7 + velocityFactor * 0.3) * 100);

      // Una skill è considerata "nuova/giovane" se la sua età rientra nel quartile Q1 o entro 7 giorni
      const isNew = lifetimeDays <= Math.max(aq.q1, 7);
      const isRecentlyUsed = daysAgo <= rq.med;

      if (isNew && isRecentlyUsed) {
        return {
          state: 'new-active',
          label: 'Nuova & attiva',
          color: '#00cbd6',
          badge: velText ? `✨ nuova · ${velText}` : '✨ nuova',
          score,
          daysAgo,
          velocity,
        };
      }

      if (daysAgo <= rq.q1) {
        return {
          state: 'active-hot',
          label: 'Molto attiva',
          color: '#3fb950',
          badge: velText ? `🔥 ${velText}` : '🔥 frequente',
          score,
          daysAgo,
          velocity,
        };
      }

      if (daysAgo <= rq.med) {
        return {
          state: 'active-warm',
          label: 'Attiva',
          color: '#56d364',
          badge: '', // Molto discreta: le skill attive standard non hanno badge rumoroso
          score,
          daysAgo,
          velocity,
        };
      }

      if (daysAgo <= rq.q3) {
        return {
          state: 'cooling',
          label: 'In calo',
          color: '#d29922',
          badge: 'in calo',
          score,
          daysAgo,
          velocity,
        };
      }

      const wasUsedALot = sk.use_count >= 10;
      return {
        state: 'stale',
        label: wasUsedALot ? 'Ex-usata in disuso' : 'In disuso',
        color: '#f85149',
        badge: wasUsedALot ? '⚠️ ex-usata' : 'in disuso',
        score,
        daysAgo,
        velocity,
      };
    }

    // Ordinamento dinamico: per attività/freschezza, totale storico, o in disuso
    function sortSkills(list) {
      return [...list].sort((a, b) => {
        const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        if (pinDiff !== 0) return pinDiff;

        if (_currentSortMode === 'activity') {
          const actA = getSkillActivity(a);
          const actB = getSkillActivity(b);
          return (actB.score - actA.score) || (b.use_count - a.use_count);
        } else if (_currentSortMode === 'stale') {
          const usedA = a.use_count > 0 ? 1 : 0;
          const usedB = b.use_count > 0 ? 1 : 0;
          if (usedA !== usedB) return usedB - usedA;
          const actA = getSkillActivity(a);
          const actB = getSkillActivity(b);
          return (actB.daysAgo - actA.daysAgo) || (b.use_count - a.use_count);
        } else {
          // 'uses' (totale storico)
          return (b.use_count - a.use_count) || a.name.localeCompare(b.name);
        }
      });
    }

    // ── Card skill (mai usate opacizzate, pinned con iconcina) ──
    // Dot provenienza: verde=nativa Hermes, arancione=scaricata, blu=creata da noi.
    const PROV_COLOR = { native: '#3fb950', external: '#d29922', ours: '#58a6ff' };
    const PROV_LABEL = { native: 'nativa Hermes', external: 'scaricata', ours: 'creata da noi' };
    function buildSkillCard(sk, { icon, iconColor, metaHtml, delAttrs, onOpen }) {
      const act = getSkillActivity(sk);
      const card = document.createElement('div');
      card.className = 'skill-card state-' + act.state + (sk.use_count > 0 ? '' : ' unused');
      card.title = sk.use_count > 0 ? 'Stato: ' + act.label + ' (score calore: ' + act.score + '/100)' : 'Mai usata';
      const useLabel = sk.use_count > 0 ? 'usata ' + sk.use_count + ' volte' : 'mai usata';
      const ago = sk.last_used_at ? timeAgo(sk.last_used_at) : '';
      const prov = sk.provenance || 'ours'; // payload vecchi senza campo
      const provDot = '<span title="Provenienza: ' + PROV_LABEL[prov] + '" style="width:8px;height:8px;border-radius:50%;flex:none;background:' + (PROV_COLOR[prov] || PROV_COLOR.ours) + ';"></span>';
      // Fonte inline (solo scaricate con author): link diretto, senza aprire il modal
      let srcHtml = '';
      if (sk.source && sk.source.author) {
        const srcUrl = sk.source.url && sk.source.url.startsWith('https://') ? sk.source.url : null;
        srcHtml = srcUrl
          ? '<a href="' + esc(srcUrl) + '" target="_blank" rel="noopener" title="Fonte: ' + esc(sk.source.author) + '" style="color:#484f58;text-decoration:none;">↗ ' + esc(sk.source.author) + '</a>'
          : '<span title="Fonte non registrata" style="color:#484f58;">' + esc(sk.source.author) + '</span>';
      }
      const pinHtml = sk.pinned
        ? '<i class="fa-solid fa-thumbtack" style="color:#d29922;font-size:11px;" title="Pinned"></i> '
        : '';

      const actBadgeHtml = (act.state !== 'unused' && act.badge)
        ? '<span class="skill-act-badge state-' + act.state + '">' + esc(act.badge) + '</span>'
        : '';

      card.innerHTML =
        '<button class="skill-card-delete" title="Cancella skill" ' + delAttrs + '>' +
        '<i class="fa-solid fa-trash-can"></i>' +
        '</button>' +
        '<div class="skill-card-header">' +
        provDot +
        '<i class="' + icon + '" style="color:' + iconColor + ';font-size:13px;flex:none;"></i>' +
        '<span class="skill-card-name">' + pinHtml + esc(sk.name) + '</span>' +
        (metaHtml || '') +
        '</div>' +
        '<div class="skill-card-meta">' +
        '  <span><i class="fa-regular fa-star"></i> ' + esc(useLabel) + '</span>' +
        (ago ? '<span class="skill-meta-ago">' + esc(ago) + '</span>' : '') +
        (srcHtml ? '<span>' + srcHtml + '</span>' : '') +
        actBadgeHtml +
        '</div>';
      if (onOpen) card.addEventListener('click', e => {
        if (e.target.closest('[data-del]') || e.target.closest('a')) return; // cestino e link fonte: non aprire il modal
        onOpen(sk);
      });
      if (onOpen) {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', e => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
            e.preventDefault();
            onOpen(sk);
          }
        });
      }
      return card;
    }

    function deleteButtonAttrs(profile, skill, type) {
      return 'data-del data-profile="' + esc(profile) + '" data-skill="' + esc(skill.name) +
        '" data-category="' + esc(skill.category || '') + '" data-type="' + type + '"';
    }

    // ── Render Skill Locali (card per profilo) ────────────────────
    export function renderSkillListByProfile(contentEl, profiles, onOpenSkill) {
      if (!profiles.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-puzzle-piece"></i>Nessun profilo configurato</div>';
        return;
      }

      const sortedProfiles = sortProfiles(profiles);
      contentEl.innerHTML = '';

      sortedProfiles.forEach(p => {
        const loc = p.skills && p.skills.local;
        const list = loc && loc.list ? loc.list : [];
        const total = loc ? loc.total : 0;

        // Una sotto-sezione <details> per profilo (nativo: click + tastiera gratis)
        const det = document.createElement('details');
        det.className = 'profile-skills';
        det.dataset.profile = p.name;
        det.open = !closedLocal.has(p.name);
        const sum = document.createElement('summary');
        sum.innerHTML = '<i class="fa-solid fa-user" style="color:#58a6ff;font-size:14px;"></i> ' + esc(p.name) +
          ' <span style="font-weight:400;color:#8b949e;font-size:13px;">&middot; ' + total + ' skill</span>';
        det.appendChild(sum);

        if (!list.length) {
          const emptyEl = document.createElement('div');
          emptyEl.className = 'profile-skills-empty';
          emptyEl.textContent = '(nessuna skill locale)';
          det.appendChild(emptyEl);
        } else {
          const sorted = sortSkills(list);
          // Raggruppa per categoria (ordine di prima apparizione = già per uso)
          const groups = new Map();
          sorted.forEach(sk => {
            const cat = sk.category || 'altro';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(sk);
          });
          groups.forEach((skills, cat) => {
            const h = document.createElement('div');
            h.style.cssText = 'font-size:12px;color:#8b949e;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.04em;';
            h.textContent = cat + ' (' + skills.length + ')';
            det.appendChild(h);
            const grid = document.createElement('div');
            grid.className = 'skill-grid';
            skills.forEach(sk => {
              grid.appendChild(buildSkillCard(sk, {
                icon: 'fa-solid fa-puzzle-piece',
                iconColor: '#d2a8ff',
                delAttrs: deleteButtonAttrs(p.name, sk, 'local'),
                onOpen: s => onOpenSkill(s, p.name, 'local'),
              }));
            });
            det.appendChild(grid);
          });
        }
        det.addEventListener('toggle', () => {
          if (localFilterHold) return;
          if (det.open) closedLocal.delete(p.name);
          else closedLocal.add(p.name);
        });
        contentEl.appendChild(det);
      });
    }

    // ── Mappa Chi-legge-cosa: conteggi vivi da API ────────────────────
    // Badge = quante skill nella cartella; ogni cella = quante ne vede il
    // profilo da quella cartella (— se non la legge); Totale = skill uniche
    // visibili dal profilo (dedup per nome tra i suoi bucket).
    export function renderSkillMap(profiles) {
      const body = document.getElementById('skill-map-body');
      if (!body) return;
      const byName = (name) => profiles.find(p => p.name === name);
      const listOf = (p, bucket) => {
        const b = p && p.skills && p.skills[bucket];
        return (b && b.list) || [];
      };
      const namesOf = (p, bucket) => new Set(listOf(p, bucket).map(sk => sk.name));
      const bucketLen = (bucket) => {
        const p = profiles.find(p => listOf(p, bucket).length);
        return p ? listOf(p, bucket).length : 0;
      };
      const localLen = (name) => listOf(byName(name), 'local').length;
      // Locali proprie di default = sue meno quelle ereditate da coder/researcher
      const coderNames = namesOf(byName('coder'), 'local');
      const researcherNames = namesOf(byName('researcher'), 'local');
      const ownDefault = listOf(byName('default'), 'local')
        .filter(sk => !coderNames.has(sk.name) && !researcherNames.has(sk.name)).length;
      const counts = {
        'shared': bucketLen('shared'),
        'frontline': bucketLen('frontline'),
        'generalist': bucketLen('primary'),
        'worker': bucketLen('worker'),
        'locali-default': ownDefault,
        'locali-ceo': localLen('ceo'),
        'locali-teacher': localLen('teacher'),
        'locali-coder': localLen('coder'),
        'locali-researcher': localLen('researcher'),
      };
      // Chi legge quale riga (default eredita locali coder + researcher)
      const reads = {
        'shared': ['default', 'ceo', 'teacher', 'coder', 'researcher'],
        'frontline': ['default', 'ceo', 'teacher'],
        'generalist': ['default', 'ceo'],
        'worker': ['default', 'coder', 'researcher'],
        'locali-default': ['default'],
        'locali-ceo': ['ceo'],
        'locali-teacher': ['teacher'],
        'locali-coder': ['coder', 'default', 'ceo'],
        'locali-researcher': ['researcher', 'default', 'ceo'],
      };
      body.querySelectorAll('[data-count]').forEach(el => {
        el.textContent = '(' + (counts[el.dataset.count] ?? 0) + ')';
      });
      body.querySelectorAll('[data-cell]').forEach(td => {
        const sep = td.dataset.cell.indexOf(':');
        const row = td.dataset.cell.slice(0, sep);
        const prof = td.dataset.cell.slice(sep + 1);
        if ((reads[row] || []).includes(prof)) {
          td.textContent = counts[row] ?? 0;
          td.style.color = '#3fb950';
        } else {
          td.textContent = '—';
          td.style.color = '#484f58';
        }
      });
      ['default', 'ceo', 'teacher', 'coder', 'researcher'].forEach(name => {
        const td = body.querySelector('td[data-total="' + name + '"]');
        if (!td) return;
        const p = profiles.find(p => p.name === name);
        if (!p || !p.skills) { td.textContent = '—'; return; }
        const names = new Set();
        ['local', 'shared', 'frontline', 'primary', 'worker', 'operator'].forEach(b => {
          const list = p.skills[b] && p.skills[b].list;
          if (list) list.forEach(sk => names.add(sk.name));
        });
        td.textContent = names.size;
      });
    }

    // ── Render matrice skill condivise/frontline (elenco unico con conteggio profili) ──
    function renderSkillMatrix(contentEl, profiles, onOpenSkill, bucket, type) {
      const section = contentEl.closest('section');
      const profilesWithBucket = sortProfiles(profiles).filter(p =>
        p.skills && p.skills[bucket] && p.skills[bucket].list && p.skills[bucket].list.length > 0
      );

      if (!profilesWithBucket.length) {
        if (section) section.style.display = 'none';  // vuota → nascosta, non box inutile
        return;
      }
      if (section) section.style.display = '';

      const baseList = profilesWithBucket[0].skills[bucket].list.map(sk => Object.assign({}, sk));
      const profileCounts = {};
      baseList.forEach(sk => {
        profileCounts[sk.name] = { count: 0, profiles: [], maxUse: sk.use_count || 0, lastUsed: sk.last_used_at };
      });

      profilesWithBucket.forEach(p => {
        p.skills[bucket].list.forEach(sk => {
          if (profileCounts[sk.name]) {
            profileCounts[sk.name].count++;
            profileCounts[sk.name].profiles.push(p.name);
            // ponytail: max tra profili, non somma — basta sapere che si usa
            if ((sk.use_count || 0) > (profileCounts[sk.name].maxUse || 0)) {
              profileCounts[sk.name].maxUse = sk.use_count;
              profileCounts[sk.name].lastUsed = sk.last_used_at;
            }
          }
        });
      });

      baseList.forEach(sk => {
        const pc = profileCounts[sk.name];
        if (pc) {
          sk.use_count = pc.maxUse;
          sk.last_used_at = pc.lastUsed;
        }
      });

      const bucketList = sortSkills(baseList);

      const grid = document.createElement('div');
      grid.className = 'skill-grid';

      bucketList.forEach(sk => {
        const pc = profileCounts[sk.name] || { count: 0, profiles: [] };
        const countLabel = pc.count + '/' + profilesWithBucket.length + ' profili';
        const card = buildSkillCard(sk, {
          icon: 'fa-solid fa-puzzle-piece',
          iconColor: '#d2a8ff',
          delAttrs: deleteButtonAttrs('default', sk, type),
          onOpen: s => onOpenSkill(s, '', type),
        });
        // Inserisce il conteggio profili accanto al nome
        const titleRow = card.querySelector('div');
        if (titleRow) {
          const span = document.createElement('span');
          span.style.cssText = 'font-size:12px;color:#8b949e;';
          span.innerHTML = '<i class="fa-regular fa-circle-check" style="color:#3fb950;"></i> ' + esc(countLabel);
          titleRow.appendChild(span);
        }
        grid.appendChild(card);
      });

      contentEl.innerHTML = '';
      contentEl.appendChild(grid);
    }

    // ── Render Skill Condivise (tutti i profili) ─────────────────────
    export function renderSkillMatrixShared(contentEl, profiles, onOpenSkill) {
      return renderSkillMatrix(contentEl, profiles, onOpenSkill, 'shared', 'shared');
    }

    // ── Render Skill Frontline (default, ceo, teacher) ───────────────
    export function renderSkillMatrixFrontline(contentEl, profiles, onOpenSkill) {
      return renderSkillMatrix(contentEl, profiles, onOpenSkill, 'frontline', 'frontline');
    }

    // ── Render Skill Worker (coder, researcher) ──────────────────────
    export function renderSkillMatrixWorker(contentEl, profiles, onOpenSkill) {
      return renderSkillMatrix(contentEl, profiles, onOpenSkill, 'worker', 'worker');
    }

    // ── Render Skill Operator (default, coder) ───────────────────────
    export function renderSkillMatrixOperator(contentEl, profiles, onOpenSkill) {
      return renderSkillMatrix(contentEl, profiles, onOpenSkill, 'operator', 'operator');
    }

    // ── Render Skill Primarie (card) ─────────────────────────────
    // ── Render Skill Primarie (card) ─────────────────────────────
    export function renderSkillPrimary(contentEl, profiles, onOpenSkill) {
      const section = contentEl.closest('section');
      const defaultProfile = profiles.find(p => p.name === 'default');

      const rawList = (defaultProfile && defaultProfile.skills && defaultProfile.skills.primary && defaultProfile.skills.primary.list)
        ? defaultProfile.skills.primary.list.map(sk => Object.assign({}, sk))
        : [];

      if (!rawList.length) {
        if (section) section.style.display = 'none';
        return;
      }
      if (section) section.style.display = '';

      // uso reale = max tra profili (la lista base è del default solo)
      const maxUse = {};
      profiles.forEach(p => {
        ((p.skills && p.skills.primary && p.skills.primary.list) || []).forEach(sk => {
          if ((sk.use_count || 0) > (maxUse[sk.name] || 0)) {
            maxUse[sk.name] = sk.use_count;
            maxUse[sk.name + '|last'] = sk.last_used_at;
          }
        });
      });

      rawList.forEach(sk => {
        sk.use_count = maxUse[sk.name] || sk.use_count || 0;
        sk.last_used_at = maxUse[sk.name + '|last'] || sk.last_used_at;
      });

      const primaryList = sortSkills(rawList);

      const grid = document.createElement('div');
      grid.className = 'skill-grid';

      primaryList.forEach(sk => {
        grid.appendChild(buildSkillCard(sk, {
          icon: 'fa-solid fa-crown',
          iconColor: '#d29922',
          metaHtml: '<span class="primary-badge"><i class="fa-solid fa-lock"></i> solo default + ceo</span>',
          delAttrs: deleteButtonAttrs('default', sk, 'primary'),
          onOpen: s => onOpenSkill(s, '', 'primary'),
        }));
      });

      contentEl.innerHTML = '';
      contentEl.appendChild(grid);
    }


    // ── Delegation click per profili e skill ─────────────────────
    // (i modal delle card sono legati con addEventListener in fase di
    // render tramite closure — nessun handler inline)
    export function initSkills({ onChanged, onOpenSkill, onOpenSoul, onOpenAgents }) {
      const profilesBody = document.getElementById('profiles-body');
      if (profilesBody) {
        profilesBody.addEventListener('click', e => {
          // Badge SOUL/AGENTS (hanno priorità sulla riga)
          const doc = e.target.closest('[data-doc]');
          if (doc) {
            e.stopPropagation();
            if (doc.dataset.doc === 'soul') onOpenSoul(doc.dataset.profile);
            else onOpenAgents(doc.dataset.profile);
            return;
          }
          // Riga profilo espandibile
          const row = e.target.closest('tr.profile-row[data-expandable]');
          if (row) {
            toggleSkills(row.dataset.profile);
            return;
          }
        });
        // Accessibilità: Enter/Space sulle righe
        profilesBody.addEventListener('keydown', e => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.profile-row[data-expandable]')) {
            e.preventDefault();
            toggleSkills(e.target.dataset.profile);
          }
        });
      }

      // Cestini delle skill (delegati: le card vengono ri-renderizzate)
      ['skill-local-content', 'skill-shared-content', 'skill-frontline-content', 'skill-worker-content', 'skill-operator-content', 'skill-primary-content'].forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        container.addEventListener('click', e => {
          const btn = e.target.closest('[data-del]');
          if (!btn) return;
          e.stopPropagation();
          deleteSkill(
            btn.dataset.profile, btn.dataset.skill,
            btn.dataset.category, btn.dataset.type || 'local',
            btn, onChanged
          );
        });
      });
    }
