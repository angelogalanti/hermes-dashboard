    // ── skills.js — profili, skill locali/condivise/primarie, bundle ──
    import { esc, sortProfiles, timeAgo } from './utils.js';

    const PLATFORM_ICONS = {
      telegram: 'fa-brands fa-telegram',
      discord:  'fa-brands fa-discord',
      whatsapp: 'fa-brands fa-whatsapp',
    };

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
          '<tr><td colspan="8">' +
          '<div class="empty-state"><i class="fas fa-users-slash"></i>Nessun profilo configurato</div>' +
          '</td></tr>';
        return;
      }

      const sorted = sortProfiles(profiles);
      tbody.innerHTML = '';
      sorted.forEach(p => {
        const safeName = p.name;

        const gatewayOn  = p.gateway === 'running' || p.gateway === 'connected';
        const gatewayDot = '<i class="fa-solid fa-circle" style="color:' +
          (gatewayOn ? '#3fb950' : '#f85149') + '; font-size:12px;"></i>';

        const healthColor = p.health === 'ok' ? '#3fb950' :
          p.health === 'error' ? '#f85149' : '#484f58';
        const healthDot = '<i class="fa-solid fa-circle" title="' + esc(p.health || 'unknown') + '" style="color:' + healthColor + '; font-size:12px;"></i>';

        const platforms = (p.platforms || []).map(pl => {
          const icon = PLATFORM_ICONS[pl.toLowerCase()];
          return icon
            ? '<span title="' + esc(pl) + '"><i class="' + icon + '"></i></span>'
            : '<span title="' + esc(pl) + '"><i class="fa-solid fa-plug"></i></span>';
        }).join('') || '<span style="color:#484f58;">&mdash;</span>';

        const hasSkills = p.skills && p.skills.total > 0;
        const totalSkills = p.skills ? p.skills.total : 0;
        const skillBadge = hasSkills
          ? '<span class="skill-badge"><i class="fa-solid fa-puzzle-piece"></i> ' + totalSkills + ' <span class="count">skill</span></span>'
          : '<span class="skill-badge" style="color:#484f58;">&mdash;</span>';

        const expandIcon = hasSkills
          ? '<i class="fa-solid fa-chevron-right expand-icon" data-expand-icon="' + esc(safeName) + '"></i>'
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
          '<td data-label="Gateway">' + gatewayDot + '</td>' +
          '<td data-label="Health">' + healthDot + '</td>' +
          '<td data-label="Piattaforme"><div class="platform-icons">' + platforms + '</div></td>' +
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
          detail.style.display = 'none';
          detail.innerHTML =
            '<td colspan="8">' +
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
        row.innerHTML = '<td colspan="8"><div class="skeleton-line" style="width:60%"></div></td>';
        tbody.appendChild(row);
      }
    }

    export function renderProfilesError(tbody, message) {
      tbody.innerHTML =
        '<tr><td colspan="8">' +
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
      const expandIcon = document.querySelector('[data-expand-icon="' + CSS.escape(profileName) + '"]');
      if (expandIcon) expandIcon.classList.toggle('expanded', isHidden);
    }

    // ── Cancellazione skill ──────────────────────────────────────
    async function deleteSkill(profileName, skillName, category, skillType, btn, onChanged) {
      if (!confirm('Cancellare la skill "' + skillName + '"?' +
        (skillType !== 'local' ? '\n\n⚠️ Skill ' + skillType + ' — visibile a TUTTI i profili.' : ''))) return;

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
          alert('Errore: ' + (data.error || 'cancellazione fallita'));
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
          }
          return;
        }
        await onChanged();
      } catch (err) {
        alert('Errore: ' + err.message);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        }
      }
    }

    // Pinned prima, poi più usate
    function sortSkills(list) {
      return [...list].sort((a, b) =>
        ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (b.use_count - a.use_count)
      );
    }

    // ── Card skill (mai usate opacizzate, pinned con iconcina) ──
    function buildSkillCard(sk, { icon, iconColor, metaHtml, delAttrs, onOpen }) {
      const card = document.createElement('div');
      card.className = 'skill-card' + (sk.use_count > 0 ? '' : ' unused');
      card.title = sk.use_count > 0 ? '' : 'Mai usata';
      const useLabel = sk.use_count > 0 ? 'usata ' + sk.use_count + ' volte' : 'mai usata';
      const ago = sk.last_used_at ? timeAgo(sk.last_used_at) : '';
      const pinHtml = sk.pinned
        ? '<i class="fa-solid fa-thumbtack" style="color:#d29922;font-size:11px;" title="Pinned"></i> '
        : '';
      card.innerHTML =
        '<button class="skill-card-delete" title="Cancella skill" ' + delAttrs + '>' +
        '<i class="fa-solid fa-trash-can"></i>' +
        '</button>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<i class="' + icon + '" style="color:' + iconColor + ';font-size:13px;"></i>' +
        '<span style="font-weight:600;color:#f0f6fc;font-size:14px;">' + pinHtml + esc(sk.name) + '</span>' +
        (metaHtml || '') +
        '</div>' +
        '<div style="display:flex;gap:12px;font-size:12px;color:#8b949e;">' +
        '<span><i class="fa-regular fa-star"></i> ' + esc(useLabel) + '</span>' +
        (ago ? '<span style="color:#484f58;">' + esc(ago) + '</span>' : '') +
        '</div>';
      if (onOpen) card.addEventListener('click', () => onOpen(sk));
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

        const header = document.createElement('h3');
        header.style.cssText = 'font-size:15px;font-weight:600;color:#f0f6fc;margin:20px 0 10px;display:flex;align-items:center;gap:8px;';
        header.innerHTML = '<i class="fa-solid fa-user" style="color:#58a6ff;font-size:14px;"></i> ' + esc(p.name) +
          ' <span style="font-weight:400;color:#8b949e;font-size:13px;">&middot; ' + total + ' skill</span>';
        contentEl.appendChild(header);

        if (!list.length) {
          const emptyEl = document.createElement('div');
          emptyEl.style.cssText = 'color:#484f58;font-size:13px;font-style:italic;padding:8px 12px;';
          emptyEl.textContent = '(nessuna skill locale)';
          contentEl.appendChild(emptyEl);
        } else {
          const sorted = sortSkills(list);
          const grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';
          sorted.forEach(sk => {
            grid.appendChild(buildSkillCard(sk, {
              icon: 'fa-solid fa-puzzle-piece',
              iconColor: '#d2a8ff',
              delAttrs: deleteButtonAttrs(p.name, sk, 'local'),
              onOpen: s => onOpenSkill(s, p.name, 'local'),
            }));
          });
          contentEl.appendChild(grid);
        }
      });
    }

    // ── Render Skill Condivise (elenco) ────────────────────────────
    export function renderSkillMatrixShared(contentEl, profiles, onOpenSkill) {
      const profilesWithShared = sortProfiles(profiles).filter(p =>
        p.skills && p.skills.shared && p.skills.shared.list && p.skills.shared.list.length > 0
      );

      if (!profilesWithShared.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-puzzle-piece"></i>Nessuna skill condivisa</div>';
        return;
      }

      const sharedList = sortSkills(profilesWithShared[0].skills.shared.list);

      const profileCounts = {};
      sharedList.forEach(sk => {
        profileCounts[sk.name] = { count: 0, profiles: [] };
      });

      profilesWithShared.forEach(p => {
        p.skills.shared.list.forEach(sk => {
          if (profileCounts[sk.name]) {
            profileCounts[sk.name].count++;
            profileCounts[sk.name].profiles.push(p.name);
          }
        });
      });

      // (già ordinata con sortSkills: pinned prima, poi use_count)

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';

      sharedList.forEach(sk => {
        const pc = profileCounts[sk.name] || { count: 0, profiles: [] };
        const countLabel = pc.count + '/' + profilesWithShared.length + ' profili';
        const card = buildSkillCard(sk, {
          icon: 'fa-solid fa-puzzle-piece',
          iconColor: '#d2a8ff',
          delAttrs: deleteButtonAttrs('', sk, 'shared'),
          onOpen: s => onOpenSkill(s, '', 'shared'),
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

    // ── Render Skill Primarie (card) ─────────────────────────────
    export function renderSkillPrimary(contentEl, profiles, onOpenSkill) {
      const defaultProfile = profiles.find(p => p.name === 'default');

      const primaryList = (defaultProfile && defaultProfile.skills && defaultProfile.skills.primary && defaultProfile.skills.primary.list)
        ? sortSkills(defaultProfile.skills.primary.list)
        : [];

      if (!primaryList.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-puzzle-piece"></i>Nessuna skill primaria per questo profilo</div>';
        return;
      }

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';

      primaryList.forEach(sk => {
        grid.appendChild(buildSkillCard(sk, {
          icon: 'fa-solid fa-crown',
          iconColor: '#d29922',
          metaHtml: '<span class="primary-badge"><i class="fa-solid fa-lock"></i> solo default + ceo</span>',
          delAttrs: deleteButtonAttrs('', sk, 'primary'),
          onOpen: s => onOpenSkill(s, '', 'primary'),
        }));
      });

      contentEl.innerHTML = '';
      contentEl.appendChild(grid);
    }

    // ── Render Skill Bundles ─────────────────────────────────────
    export function renderSkillBundles(contentEl, bundles, onOpenSkill) {
      if (!bundles || !bundles.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-layer-group"></i>Nessun bundle di skill configurato</div>';
        return;
      }

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';

      bundles.forEach(b => {
        const skillCount = b.skills ? b.skills.length : 0;
        const skillsSnippet = b.skills ? b.skills.map(s =>
          '<span style="background:#1f242c;border:1px solid #30363d;border-radius:4px;padding:2px 6px;font-size:11px;color:#8b949e;display:inline-flex;align-items:center;gap:4px;">' +
          '<i class="fa-solid fa-puzzle-piece" style="color:#2ea043;font-size:9px;"></i>' + esc(s) +
          '</span>'
        ).join(' ') : '';

        const card = document.createElement('div');
        card.className = 'skill-bundle-card';
        card.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<i class="fa-solid fa-layer-group" style="color:#00cbd6;font-size:13px;"></i>' +
              '<span style="font-weight:600;color:#f0f6fc;font-size:14px;">' + esc(b.name) + '</span>' +
            '</div>' +
            '<span style="background:#1f2937;color:#c9d1d9;font-size:11px;padding:2px 6px;border-radius:12px;font-weight:500;">' +
              skillCount + ' skill' +
            '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:#8b949e;line-height:1.4;min-height:18px;">' + esc(b.description) + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' +
            skillsSnippet +
          '</div>';

        card.addEventListener('click', () => onOpenSkill(b, null, 'bundle'));
        grid.appendChild(card);
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
      ['skill-local-content', 'skill-shared-content', 'skill-primary-content'].forEach(id => {
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
