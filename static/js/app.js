    const API = '/api/status';

    // ── Column definitions ──────────────────────────────────────────
    const COLUMNS = [
      { id: 'triage',  label: 'Triage',  icon: 'fa-solid fa-filter' },
      { id: 'todo',    label: 'Todo',    icon: 'fa-solid fa-pen' },
      { id: 'ready',   label: 'Ready',   icon: 'fa-solid fa-check-double' },
      { id: 'running', label: 'Running', icon: 'fa-solid fa-play' },
      { id: 'blocked', label: 'Blocked', icon: 'fa-solid fa-ban' },
      { id: 'done',    label: 'Done',    icon: 'fa-solid fa-check' },
    ];

    const COLUMN_MAP = Object.fromEntries(COLUMNS.map(c => [c.id, c]));

    // ── Platform icon map ────────────────────────────────────────
    const PLATFORM_ICONS = {
      telegram: 'fa-brands fa-telegram',
      discord:  'fa-brands fa-discord',
      whatsapp: 'fa-brands fa-whatsapp',
    };

    // ── Triage visibility ───────────────────────────────────────────
    let showTriage = localStorage.getItem('dashboard_show_triage') === 'true';

    // ── DOM refs ─────────────────────────────────────────────────
    const profilesBody = document.getElementById('profiles-body');
    const kanbanBoard  = document.getElementById('kanban-board');
    const lastUpdateEl = document.getElementById('last-update');
    const refreshBtn   = document.getElementById('refresh-btn');
    const healthBtn    = document.getElementById('health-btn');
    const triageCheck  = document.getElementById('triage-check');

    let autoTimer = null;

    // ── Abbreviate task id ───────────────────────────────────────
    function shortId(id) {
      if (!id) return '\u2014';
      return id.length > 10 ? id.slice(0, 10) + '\u2026' : id;
    }

    // ── Format date relative ─────────────────────────────────────
    function timeAgo(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const now = new Date();
      const diff = Math.floor((now - d) / 1000);
      if (diff < 60) return 'ora';
      if (diff < 3600) return Math.floor(diff / 60) + 'm';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      return Math.floor(diff / 86400) + 'g';
    }

    // ── Toggle triage visibility ──────────────────────────────────
    function toggleTriage() {
      showTriage = triageCheck.checked;
      localStorage.setItem('dashboard_show_triage', showTriage);
      const triageCol = document.querySelector('.kanban-column[data-col="triage"]');
      if (triageCol) {
        triageCol.classList.toggle('col-hidden', !showTriage);
      }
    }

    // ── Build the empty board structure ──────────────────────────
    function buildBoard() {
      kanbanBoard.innerHTML = COLUMNS.map(col => {
        const cls = 'kanban-column col-' + col.id;
        return '<div class="' + cls + '" data-col="' + col.id + '">' +
          '<div class="kanban-column-header">' +
          '<i class="' + col.icon + '"></i> ' + col.label +
          '<span class="count" id="count-' + col.id + '">0</span>' +
          '</div>' +
          '<div class="kanban-cards" id="cards-' + col.id + '">' +
          '<div class="kanban-column-empty" id="empty-' + col.id + '">' +
          '<i class="fa-solid fa-circle-dashed"></i>Nessun task' +
          '</div>' +
          '</div>' +
          '</div>';
      }).join('');
    }

    // ── Fetch & render ───────────────────────────────────────────
    async function refresh() {
      refreshBtn.classList.add('loading');

      try {
        const resp = await fetch(API);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();

        renderKanbanBoard(data.kanban || []);
        renderProfiles(data.profiles || []);
        renderSkillListByProfile(data.profiles || []);
        renderSkillMatrixShared(data.profiles || []);
        renderSkillPrimary(data.profiles || []);

        // Fetch and render skill bundles
        try {
          const bundleResp = await fetch('/api/skill-bundles');
          if (bundleResp.ok) {
            const bundles = await bundleResp.json();
            renderSkillBundles(bundles);
          }
        } catch (bundleErr) {
          console.error('Failed to load skill bundles:', bundleErr);
        }

        const now = new Date();
        lastUpdateEl.textContent = 'Ultimo aggiornamento: ' +
          now.toLocaleTimeString('it-IT');
      } catch (err) {
        profilesBody.innerHTML =
          '<tr><td colspan="8">' +
          '<div class="error-state">' +
          '<i class="fas fa-triangle-exclamation"></i>' +
          'Errore nel caricamento dei dati: ' + err.message +
          '</div></td></tr>';
        kanbanBoard.innerHTML =
          '<div class="error-state">' +
          '<i class="fas fa-triangle-exclamation"></i>' +
          'Errore nel caricamento dei dati: ' + err.message +
          '</div>';
      } finally {
        refreshBtn.classList.remove('loading');
      }
    }

    // ── Test health ────────────────────────────────────────────
    async function testHealth() {
      healthBtn.classList.add('loading');
      healthBtn.disabled = true;
      try {
        await fetch('/api/health?force=1');
        await refresh();
      } catch (err) {
        console.error('Health test failed:', err);
      } finally {
        healthBtn.disabled = false;
        healthBtn.classList.remove('loading');
      }
    }

    // ── Sort profiles: default → ceo → gateway running (by name) → others (by name) ──
    function sortProfiles(profiles) {
      return [...profiles].sort((a, b) => {
        // 1. default always first
        if (a.name === 'default') return -1;
        if (b.name === 'default') return 1;
        // 2. ceo always second
        if (a.name === 'ceo') return -1;
        if (b.name === 'ceo') return 1;
        // 3. Gateway running profiles sorted by name
        const aGw = a.gateway === 'running';
        const bGw = b.gateway === 'running';
        if (aGw && !bGw) return -1;
        if (!aGw && bGw) return 1;
        // 4. Otherwise sort by name
        return a.name.localeCompare(b.name);
      });
    }

    // ── Render Profili ───────────────────────────────────────────
    function renderProfiles(profiles) {
      if (!profiles.length) {
        profilesBody.innerHTML =
          '<tr><td colspan="8">' +
          '<div class="empty-state"><i class="fas fa-users-slash"></i>Nessun profilo configurato</div>' +
          '</td></tr>';
        return;
      }

      const sorted = sortProfiles(profiles);
      let html = '';
      sorted.forEach((p, idx) => {
        const safeName = esc(p.name);

        // Gateway dot
        const gatewayOn  = p.gateway === 'running' || p.gateway === 'connected';
        const gatewayDot = '<i class="fa-solid fa-circle" style="color:' +
          (gatewayOn ? '#3fb950' : '#f85149') + '; font-size:12px;"></i>';

        // Health dot
        const healthColor = p.health === 'ok' ? '#3fb950' :
          p.health === 'error' ? '#f85149' : '#484f58';
        const healthDot = '<i class="fa-solid fa-circle" title="' + esc(p.health || 'unknown') + '" style="color:' + healthColor + '; font-size:12px;"></i>';

        // Platforms
        const platforms = (p.platforms || []).map(pl => {
          const icon = PLATFORM_ICONS[pl.toLowerCase()];
          return icon
            ? '<span title="' + esc(pl) + '"><i class="' + icon + '"></i></span>'
            : '<span title="' + esc(pl) + '"><i class="fa-solid fa-plug"></i></span>';
        }).join('') || '<span style="color:#484f58;">&mdash;</span>';

        // Skill badge
        const hasSkills = p.skills && p.skills.total > 0;
        const totalSkills = p.skills ? p.skills.total : 0;
        const skillBadge = hasSkills
          ? '<span class="skill-badge"><i class="fa-solid fa-puzzle-piece"></i> ' + totalSkills + ' <span class="count">skill</span></span>'
          : '<span class="skill-badge" style="color:#484f58;">&mdash;</span>';

        // Expand icon (only when skills exist)
        const expandIcon = hasSkills
          ? '<i class="fa-solid fa-chevron-right expand-icon" id="expand-' + safeName + '"></i>'
          : '<span class="no-expand"></span>';

        // Profile row
        const onClick = hasSkills ? ' onclick="toggleSkills(\'' + safeName + '\')" role="button" tabindex="0"' : '';
        html += '<tr class="profile-row" data-profile="' + safeName + '"' + onClick + '>' +
          '<td data-label="Profilo"><div class="profile-name">' + expandIcon + ' <i class="fa-solid fa-user"></i> ' + safeName + '</div></td>' +
          '<td data-label="Gateway">' + gatewayDot + '</td>' +
          '<td data-label="Health">' + healthDot + '</td>' +
          '<td data-label="Piattaforme"><div class="platform-icons">' + platforms + '</div></td>' +
          '<td data-label="Modello"><span class="model-cell">' + esc(p.model || '-') + '</span></td>' +
          '<td data-label="Provider"><span class="provider-cell">' + esc(p.provider || '-') + '</span></td>' +
          '<td data-label="SOUL/AGENTS" class="soul-agents-cell">' + renderSoulAgents(p) + '</td>' +
          '<td data-label="Skill">' + skillBadge + '</td>' +

          '</tr>';

        // Skill detail row (hidden)
        if (hasSkills) {
          const top5 = (p.skills.top || []).slice(0, 5);
          let skillItems = '';
          top5.forEach(sk => {
            const ago = timeAgo(sk.last_used_at);
            const agoHtml = ago ? '<span class="last-used">' + ago + '</span>' : '';
            skillItems += '<span class="skill-item">' +
              '<i class="fa-regular fa-star"></i> ' +
              '<span class="name">' + esc(sk.name) + '</span>' +
              ' <span class="count">(' + sk.use_count + ')</span>' +
              agoHtml +
              '</span>';
          });

          // Categories
          const cats = p.skills.categories || [];
          if (cats.length) {
            skillItems += '<span class="skill-item" style="background:transparent;border-color:transparent;color:#484f58;font-size:11px;">' +
              '<i class="fa-regular fa-folder"></i> ' + esc(cats.join(', ')) +
              '</span>';
          }

          html += '<tr class="skill-detail-row" id="skills-' + safeName + '" style="display:none">' +
            '<td colspan="8">' +
            '<div class="skill-title"><i class="fa-solid fa-puzzle-piece"></i> Skill</div>' +
            '<div class="skill-list">' + skillItems + '</div>' +
            '</td>' +
            '</tr>';
        }
      });

      profilesBody.innerHTML = html;
    }

    // ── Toggle skill detail row ──────────────────────────────────
    function toggleSkills(profileName) {
      const detailRow = document.getElementById('skills-' + profileName);
      if (!detailRow) return;

      const isHidden = detailRow.style.display === 'none';
      detailRow.style.display = isHidden ? 'table-row' : 'none';

      // Rotate expand icon
      const expandIcon = document.getElementById('expand-' + profileName);
      if (expandIcon) {
        expandIcon.classList.toggle('expanded', isHidden);
      }
    }

    // ── Render Kanban Board ──────────────────────────────────────
    function renderKanbanBoard(tasks) {
      // Group tasks by status
      const groups = {};
      COLUMNS.forEach(c => { groups[c.id] = []; });

      tasks.forEach(t => {
        const s = (t.status || 'todo').toLowerCase();
        if (groups[s]) {
          groups[s].push(t);
        } else {
          // Unknown status goes to triage
          groups['triage'].push(t);
        }
      });

      COLUMNS.forEach(col => {
        const colTasks = groups[col.id];
        const cardsEl  = document.getElementById('cards-' + col.id);
        const countEl  = document.getElementById('count-' + col.id);
        const emptyEl  = document.getElementById('empty-' + col.id);
        const colEl    = cardsEl?.closest?.('.kanban-column');

        // Update count
        countEl.textContent = colTasks.length;

        // Mark empty columns with col-empty class for narrower flex
        if (colEl) {
          colEl.classList.toggle('col-empty', colTasks.length === 0);
        }

        if (!colTasks.length) {
          // Show empty state, clear any cards
          const empties = cardsEl.querySelectorAll('.kanban-card');
          empties.forEach(e => e.remove());
          emptyEl.style.display = 'block';
          return;
        }

        // Hide empty state
        emptyEl.style.display = 'none';

        // Render cards (keep existing empty placeholder, replace cards)
        const existingCards = cardsEl.querySelectorAll('.kanban-card');
        existingCards.forEach(e => e.remove());

        colTasks.forEach(t => {
          const card = document.createElement('div');
          card.className = 'kanban-card' + (col.id === 'blocked' ? ' archive' : '');
          let archiveBtn = '';
          if (col.id === 'blocked') {
            archiveBtn = '<button class="kanban-card-archive" title="Archivia task" onclick="archiveTask(\'' + esc(t.id) + '\', event)"><i class="fa-solid fa-box-archive"></i></button>';
          }
          card.innerHTML =
            archiveBtn +
            '<div class="kanban-card-title">' + esc(t.title) + '</div>' +
            '<div class="kanban-card-meta">' +
            '<span class="kanban-card-id">' + esc(shortId(t.id)) + '</span>' +
            '<span class="kanban-card-assignee">' +
            '<i class="fa-solid fa-user"></i> ' + esc(t.assignee || '-') +
            '</span>' +
            '</div>';
          cardsEl.appendChild(card);
        });
      });
    }

    // ── Archive task ────────────────────────────────────────────
    async function archiveTask(taskId, event) {
      if (event) event.stopPropagation();
      if (!confirm('Archiviare il task ' + taskId + '?')) return;
      try {
        const resp = await fetch('/api/kanban/archive/' + encodeURIComponent(taskId), {
          method: 'POST',
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        await refresh();
      } catch (err) {
        console.error('Errore archiviazione task:', err);
      }
    }

    // ── Render Skill Locali (card per profilo) ────────────────────
    function renderSkillListByProfile(profiles) {
      const contentEl = document.getElementById('skill-local-content');
      if (!contentEl) return;

      if (!profiles.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-puzzle-piece"></i>Nessun profilo configurato</div>';
        return;
      }

      // Sort profiles: default → ceo → gw running → others
      const sortedProfiles = sortProfiles(profiles);

      // Clear and rebuild with DOM elements
      contentEl.innerHTML = '';

      sortedProfiles.forEach(p => {
        const loc = p.skills && p.skills.local;
        const list = loc && loc.list ? loc.list : [];
        const total = loc ? loc.total : 0;

        // Profile header
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
          // Sort by use_count descending
          const sorted = [...list].sort((a, b) => b.use_count - a.use_count);

          const grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';

          sorted.forEach(sk => {
            const useLabel = sk.use_count > 0 ? 'usata ' + sk.use_count + ' volte' : 'mai usata';
            const ago = sk.last_used_at ? timeAgo(sk.last_used_at) : '';

            const card = document.createElement('div');
            card.className = 'skill-card';
            card.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:4px;cursor:pointer;';
            card.innerHTML =
              '<div style="display:flex;align-items:center;gap:8px;">' +
              '<i class="fa-solid fa-puzzle-piece" style="color:#d2a8ff;font-size:13px;"></i>' +
              '<span style="font-weight:600;color:#f0f6fc;font-size:14px;">' + esc(sk.name) + '</span>' +
              '</div>' +
              '<div style="display:flex;gap:12px;font-size:12px;color:#8b949e;">' +
              '<span><i class="fa-regular fa-star"></i> ' + useLabel + '</span>' +
              (ago ? '<span style="color:#484f58;">' + ago + '</span>' : '') +
              '</div>';
            card.addEventListener('click', () => openSkillModal(sk, p.name, 'local'));
            grid.appendChild(card);
          });

          contentEl.appendChild(grid);
        }
      });
    }

    // ── Render Skill Condivise (elenco) ────────────────────────────
    function renderSkillMatrixShared(profiles) {
      const contentEl = document.getElementById('skill-shared-content');
      if (!contentEl) return;

      // Sort profiles then find those with shared skills
      const profilesWithShared = sortProfiles(profiles).filter(p =>
        p.skills && p.skills.shared && p.skills.shared.list && p.skills.shared.list.length > 0
      );

      if (!profilesWithShared.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-puzzle-piece"></i>Nessuna skill condivisa</div>';
        return;
      }

      // Use the first profile's shared list as the canonical list (they're the same for all)
      const sharedList = profilesWithShared[0].skills.shared.list;

      // Count how many profiles have each shared skill
      const profileCounts = {};
      sharedList.forEach(sk => {
        profileCounts[sk.name] = {
          count: 0,
          profiles: [],
        };
      });

      profilesWithShared.forEach(p => {
        p.skills.shared.list.forEach(sk => {
          if (profileCounts[sk.name]) {
            profileCounts[sk.name].count++;
            profileCounts[sk.name].profiles.push(p.name);
          }
        });
      });

      // Sort by use_count descending
      sharedList.sort((a, b) => b.use_count - a.use_count);

      // Build grid with DOM elements
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';

      sharedList.forEach(sk => {
        const pc = profileCounts[sk.name] || { count: 0, profiles: [] };
        const countLabel = pc.count + '/' + profilesWithShared.length + ' profili';
        const useLabel = sk.use_count > 0 ? 'usata ' + sk.use_count + ' volte' : 'mai usata';
        const ago = sk.last_used_at ? timeAgo(sk.last_used_at) : '';

        const card = document.createElement('div');
        card.className = 'skill-card';
        card.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:4px;cursor:pointer;';
        card.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;">' +
          '<i class="fa-solid fa-puzzle-piece" style="color:#d2a8ff;font-size:13px;"></i>' +
          '<span style="font-weight:600;color:#f0f6fc;font-size:14px;">' + esc(sk.name) + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:12px;font-size:12px;color:#8b949e;">' +
          '<span><i class="fa-regular fa-circle-check" style="color:#3fb950;"></i> ' + countLabel + '</span>' +
          '<span><i class="fa-regular fa-star"></i> ' + useLabel + '</span>' +
          (ago ? '<span style="color:#484f58;">' + ago + '</span>' : '') +
          '</div>';
        card.addEventListener('click', () => openSkillModal(sk, '', 'shared'));
        grid.appendChild(card);
      });

      contentEl.innerHTML = '';
      contentEl.appendChild(grid);
    }

    // ── Render Skill Primarie (card) ─────────────────────────────
    function renderSkillPrimary(profiles) {
      const contentEl = document.getElementById('skill-primary-content');
      if (!contentEl) return;

      // Find default and ceo profiles, then extract their primary skills
      const defaultProfile = profiles.find(p => p.name === 'default');
      const ceoProfile = profiles.find(p => p.name === 'ceo');

      // Use default's primary list as canonical (they're the same skills)
      const primaryList = (defaultProfile && defaultProfile.skills && defaultProfile.skills.primary && defaultProfile.skills.primary.list)
        ? [...defaultProfile.skills.primary.list]
        : [];

      if (!primaryList.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-puzzle-piece"></i>Nessuna skill primaria per questo profilo</div>';
        return;
      }

      // Sort by use_count descending
      primaryList.sort((a, b) => b.use_count - a.use_count);

      // Build grid with DOM elements
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';

      primaryList.forEach(sk => {
        const useLabel = sk.use_count > 0 ? 'usata ' + sk.use_count + ' volte' : 'mai usata';
        const ago = sk.last_used_at ? timeAgo(sk.last_used_at) : '';

        const card = document.createElement('div');
        card.className = 'skill-card';
        card.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:4px;cursor:pointer;';
        card.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;">' +
          '<i class="fa-solid fa-crown" style="color:#d29922;font-size:13px;"></i>' +
          '<span style="font-weight:600;color:#f0f6fc;font-size:14px;">' + esc(sk.name) + '</span>' +
          '<span class="primary-badge"><i class="fa-solid fa-lock"></i> solo default + ceo</span>' +
          '</div>' +
          '<div style="display:flex;gap:12px;font-size:12px;color:#8b949e;">' +
          '<span><i class="fa-regular fa-star"></i> ' + useLabel + '</span>' +
          (ago ? '<span style="color:#484f58;">' + ago + '</span>' : '') +
          '</div>';
        card.addEventListener('click', () => openSkillModal(sk, '', 'primary'));
        grid.appendChild(card);
      });

      contentEl.innerHTML = '';
      contentEl.appendChild(grid);
    }

    // ── SOUL/AGENTS render ──────────────────────────────────────
    function renderSoulAgents(p) {
      const safeName = esc(p.name);
      const soul = p.has_soul
        ? '<span class="soul-badge soul" onclick="openSoulModal(\'' + safeName + '\')" title="Mostra SOUL.md"><i class="fa-solid fa-spa"></i> SOUL</span>'
        : '<span class="soul-badge missing" title="SOUL.md assente">&mdash;</span>';
      const agents = p.has_agents
        ? '<span class="soul-badge agents" onclick="openAgentsModal(\'' + safeName + '\')" title="Mostra AGENTS.md"><i class="fa-solid fa-robot"></i> AGENTS</span>'
        : '<span class="soul-badge missing" title="AGENTS.md assente">&mdash;</span>';
      return soul + agents;
    }

    // ── Helpers ──────────────────────────────────────────────────
    function esc(s) {
      const div = document.createElement('div');
      div.textContent = s == null ? '' : String(s);
      return div.innerHTML;
    }

    // ── Render Skill Bundles ─────────────────────────────────────
    function renderSkillBundles(bundles) {
      const contentEl = document.getElementById('skill-bundles-content');
      if (!contentEl) return;

      if (!bundles || !bundles.length) {
        contentEl.innerHTML =
          '<div class="empty-state"><i class="fa-solid fa-layer-group"></i>Nessun bundle di skill configurato</div>';
        return;
      }

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;';

      bundles.forEach(b => {
        const skillCount = b.skills ? b.skills.length : 0;
        const skillWord = 'skill';

        const skillsSnippet = b.skills ? b.skills.slice(0, 3).map(s =>
          '<span style="background:#1f242c;border:1px solid #30363d;border-radius:4px;padding:2px 6px;font-size:11px;color:#8b949e;display:inline-flex;align-items:center;gap:4px;">' +
          '<i class="fa-solid fa-puzzle-piece" style="color:#2ea043;font-size:9px;"></i>' + esc(s) +
          '</span>'
        ).join(' ') + (skillCount > 3 ? ' <span style="font-size:11px;color:#8b949e;">+' + (skillCount - 3) + '</span>' : '') : '';

        const card = document.createElement('div');
        card.className = 'skill-bundle-card';
        card.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<i class="fa-solid fa-layer-group" style="color:#00cbd6;font-size:13px;"></i>' +
              '<span style="font-weight:600;color:#f0f6fc;font-size:14px;">' + esc(b.name) + '</span>' +
            '</div>' +
            '<span style="background:#1f2937;color:#c9d1d9;font-size:11px;padding:2px 6px;border-radius:12px;font-weight:500;">' +
              skillCount + ' ' + skillWord +
            '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:#8b949e;line-height:1.4;min-height:18px;">' + esc(b.description) + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' +
            skillsSnippet +
          '</div>';

        card.addEventListener('click', () => openSkillModal(b, null, 'bundle'));
        grid.appendChild(card);
      });

      contentEl.innerHTML = '';
      contentEl.appendChild(grid);
    }

    // ── Skill Modal ──────────────────────────────────────────────
    function openSkillModal(skillObj, profileName, type) {
      const overlay = document.getElementById('skill-modal');
      if (!overlay) return;

      if (typeof skillObj === "string") {
        try { skillObj = JSON.parse(skillObj); } catch (e) { return; }
      }

      // Elementi aggiuntivi del bundle
      const bundleDetails = document.getElementById('modal-bundle-details');
      const bundleSkills = document.getElementById('modal-bundle-skills');
      const bundleInstructionContainer = document.getElementById('modal-bundle-instruction-container');
      const bundleInstruction = document.getElementById('modal-bundle-instruction');

      // Elementi standard da nascondere/mostrare
      const statsEl = overlay.querySelector('.skill-modal-stats');
      const datesEl = overlay.querySelector('.skill-modal-dates');
      const stateEl = document.getElementById('modal-state');
      const pinnedEl = document.getElementById('modal-pinned');

      if (type === 'bundle') {
        if (statsEl) statsEl.style.display = 'none';
        if (datesEl) datesEl.style.display = 'none';
        if (stateEl) stateEl.style.display = 'none';
        if (pinnedEl) pinnedEl.style.display = 'none';

        if (bundleDetails) {
          bundleDetails.style.display = 'flex';

          if (bundleSkills) {
            bundleSkills.innerHTML = (skillObj.skills || []).map(s =>
              '<span style="background:#161b22;border:1px solid #30363d;border-radius:4px;padding:4px 8px;font-size:12px;color:#c9d1d9;display:inline-flex;align-items:center;gap:6px;">' +
              '<i class="fa-solid fa-puzzle-piece" style="color:#2ea043;font-size:10px;"></i>' + esc(s) +
              '</span>'
            ).join('');
          }

          if (bundleInstructionContainer && bundleInstruction) {
            if (skillObj.instruction) {
              bundleInstruction.textContent = skillObj.instruction;
              bundleInstructionContainer.style.display = 'block';
            } else {
              bundleInstruction.textContent = '';
              bundleInstructionContainer.style.display = 'none';
            }
          }
        }
      } else {
        if (statsEl) statsEl.style.display = 'flex';
        if (datesEl) datesEl.style.display = 'flex';
        if (stateEl) stateEl.style.display = 'block';

        if (bundleDetails) bundleDetails.style.display = 'none';

        document.getElementById('modal-use-count').textContent = skillObj.use_count || 0;
        document.getElementById('modal-view-count').textContent = skillObj.view_count || 0;
        document.getElementById('modal-patch-count').textContent = skillObj.patch_count || 0;

        const state = skillObj.state || 'active';
        stateEl.className = 'skill-modal-state ' + (state === 'active' ? 'active' : 'inactive');
        stateEl.innerHTML = '<i class="fa-solid fa-circle"></i> ' + state.charAt(0).toUpperCase() + state.slice(1);

        setModalDate('modal-created-at', skillObj.created_at);
        setModalDate('modal-last-used-at', skillObj.last_used_at);
        setModalDate('modal-last-viewed-at', skillObj.last_viewed_at);
        setModalDate('modal-last-patched-at', skillObj.last_patched_at);

        if (skillObj.pinned) {
          pinnedEl.style.display = 'inline-flex';
        } else {
          pinnedEl.style.display = 'none';
        }
      }

      document.getElementById('modal-name').textContent = skillObj.name || '';
      document.getElementById('modal-category').textContent = type === 'bundle' ? 'Skill Bundle' : (skillObj.category || '(senza categoria)');

      const descEl = document.getElementById('modal-description');
      const desc = skillObj.description || '';
      if (desc) {
        descEl.textContent = desc;
        descEl.style.display = 'block';
      } else {
        descEl.textContent = '';
        descEl.style.display = 'none';
      }

      const profileSpan = document.getElementById('modal-profile-name');
      if (type === 'local') {
        profileSpan.textContent = 'Profilo: ' + (profileName || '?');
      } else if (type === 'primary') {
        profileSpan.textContent = 'Skill primaria — solo default e ceo';
      } else if (type === 'shared') {
        profileSpan.textContent = 'Skill condivisa — presente in tutti i profili';
      } else if (type === 'bundle') {
        profileSpan.textContent = 'Disponibile globalmente — carica le skill abilitate nel profilo corrente';
      }

      overlay.classList.add('open');
    }

    function setModalDate(elementId, dateStr) {
      const el = document.getElementById(elementId);
      if (!el) return;
      if (!dateStr) {
        el.innerHTML = '<span style="color:#484f58;">—</span>';
        return;
      }
      const d = new Date(dateStr);
      const formatted = d.toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const ago = timeAgo(dateStr);
      el.innerHTML = '<span>' + formatted + '</span>' +
        (ago ? '<span class="ago">(' + ago + ')</span>' : '');
    }

    function closeSkillModal(event) {
      // Called from overlay click & close button
      const overlay = document.getElementById('skill-modal');
      if (!overlay) return;
      overlay.classList.remove('open');
    }

    function openSoulModal(profileName) {
      document.getElementById("soul-modal-title").textContent = "SOUL.md - " + profileName;
      document.getElementById("soul-modal-subtitle").textContent = "";
      document.getElementById("soul-modal-content").textContent = "Caricamento...";
      document.getElementById("soul-modal").classList.add("open");
      fetch("/api/profile/" + encodeURIComponent(profileName) + "/soul")
        .then(r => r.json())
        .then(data => {
          if (data.exists) {
            document.getElementById("soul-modal-content").textContent = data.content;
            document.getElementById("soul-modal-subtitle").textContent = data.path || "";
          } else {
            document.getElementById("soul-modal-content").textContent = "File SOUL.md non trovato per il profilo " + profileName;
          }
        })
        .catch(err => {
          document.getElementById("soul-modal-content").textContent = "Errore: " + err.message;
        });
    }

    function openAgentsModal(profileName) {
      document.getElementById("soul-modal-title").textContent = "AGENTS.md - " + profileName;
      document.getElementById("soul-modal-subtitle").textContent = "";
      document.getElementById("soul-modal-content").textContent = "Caricamento...";
      document.getElementById("soul-modal").classList.add("open");
      fetch("/api/profile/" + encodeURIComponent(profileName) + "/agents")
        .then(r => r.json())
        .then(data => {
          if (data.exists) {
            document.getElementById("soul-modal-content").textContent = data.content;
            document.getElementById("soul-modal-subtitle").textContent = data.path || "";
          } else {
            document.getElementById("soul-modal-content").textContent = "File AGENTS.md non trovato per il profilo " + profileName;
          }
        })
        .catch(err => {
          document.getElementById("soul-modal-content").textContent = "Errore: " + err.message;
        });
    }

    function closeSoulModal(event) {
      const overlay = document.getElementById("soul-modal");
      if (!overlay) return;
      overlay.classList.remove("open");
    }

    // Close modal on ESC
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        closeSkillModal();
        closeSoulModal();
      }
    });

    // ── Auto-refresh ─────────────────────────────────────────────
    function startAutoRefresh() {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = setInterval(refresh, 10000);
    }

    // ── Init ─────────────────────────────────────────────────────
    buildBoard();
    triageCheck.checked = showTriage;
    toggleTriage();  // apply initial visibility
    refresh();
    startAutoRefresh();
