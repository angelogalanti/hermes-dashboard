    // ── modals.js — skill / SOUL-AGENTS / heartbeat ────────────────
    import { esc, shortId, timeAgo } from './utils.js';
    import { fetchJSON } from './api.js';

    // ── Skill Modal ──────────────────────────────────────────────
    export function openSkillModal(skillObj, profileName, type) {
      const overlay = document.getElementById('skill-modal');
      if (!overlay) return;

      if (typeof skillObj === 'string') {
        try { skillObj = JSON.parse(skillObj); } catch (e) { return; }
      }

      const bundleDetails = document.getElementById('modal-bundle-details');
      const bundleSkills = document.getElementById('modal-bundle-skills');
      const bundleInstructionContainer = document.getElementById('modal-bundle-instruction-container');
      const bundleInstruction = document.getElementById('modal-bundle-instruction');

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
        stateEl.innerHTML = '<i class="fa-solid fa-circle"></i> ' + esc(state.charAt(0).toUpperCase() + state.slice(1));

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
      el.innerHTML = '<span>' + esc(formatted) + '</span>' +
        (ago ? '<span class="ago">(' + esc(ago) + ')</span>' : '');
    }

    export function closeSkillModal() {
      const overlay = document.getElementById('skill-modal');
      if (!overlay) return;
      overlay.classList.remove('open');
    }

    // ── SOUL / AGENTS Modal ──────────────────────────────────────
    function openTextModal(title, url, missingMsg) {
      document.getElementById('soul-modal-title').textContent = title;
      document.getElementById('soul-modal-subtitle').textContent = '';
      document.getElementById('soul-modal-content').textContent = 'Caricamento...';
      document.getElementById('soul-modal').classList.add('open');
      fetchJSON(url, { retries: 1 })
        .then(data => {
          if (data && data.exists) {
            document.getElementById('soul-modal-content').textContent = data.content;
            document.getElementById('soul-modal-subtitle').textContent = data.path || '';
          } else {
            document.getElementById('soul-modal-content').textContent = missingMsg;
          }
        })
        .catch(err => {
          document.getElementById('soul-modal-content').textContent = 'Errore: ' + err.message;
        });
    }

    export function openSoulModal(profileName) {
      openTextModal(
        'SOUL.md - ' + profileName,
        '/api/profile/' + encodeURIComponent(profileName) + '/soul',
        'File SOUL.md non trovato per il profilo ' + profileName
      );
    }

    export function openAgentsModal(profileName) {
      openTextModal(
        'AGENTS.md - ' + profileName,
        '/api/profile/' + encodeURIComponent(profileName) + '/agents',
        'File AGENTS.md non trovato per il profilo ' + profileName
      );
    }

    export function closeSoulModal() {
      const overlay = document.getElementById('soul-modal');
      if (!overlay) return;
      overlay.classList.remove('open');
    }

    // ── Heartbeat Modal ──────────────────────────────────────────
    export async function openHeartbeatModal(taskId) {
      const overlay = document.getElementById('heartbeat-modal');
      if (!overlay) return;

      document.getElementById('heartbeat-modal-title').textContent =
        'Heartbeat \u2014 ' + shortId(taskId);
      document.getElementById('heartbeat-modal-content').innerHTML =
        '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Caricamento...</div>';
      overlay.classList.add('open');

      try {
        const data = await fetchJSON('/api/kanban/' + encodeURIComponent(taskId) + '/heartbeats', { retries: 1 });

        if (!data.heartbeats || data.heartbeats.length === 0) {
          document.getElementById('heartbeat-modal-content').innerHTML =
            '<div class="empty-state"><i class="fa-solid fa-heart-circle-minus"></i> Nessun heartbeat registrato</div>';
          return;
        }

        let html = '<div class="hb-summary">' +
          '<span><i class="fa-solid fa-heart-pulse" style="color:#f85149;"></i> ' + data.total + ' heartbeat totali</span>' +
          '</div>';

        html += '<div class="hb-timeline">';
        data.heartbeats.forEach(h => {
          const d = new Date(h.created_at * 1000);
          const timeStr = d.toLocaleTimeString('it-IT');
          const dateStr = d.toLocaleDateString('it-IT');
          const note = h.note ? esc(h.note) : '<span class="hb-note-none">(nessuna nota)</span>';
          const runBadge = h.run_id ? '<span class="hb-run-badge">Run #' + esc(String(h.run_id)) + '</span>' : '';
          html += '<div class="hb-timeline-item">' +
            '<div class="hb-timeline-dot"></div>' +
            '<div class="hb-timeline-content">' +
            '<div class="hb-timeline-header">' +
            '<span class="hb-timeline-time">' + esc(dateStr) + ' ' + esc(timeStr) + '</span>' +
            runBadge +
            '</div>' +
            '<div class="hb-timeline-note">' + note + '</div>' +
            '</div>' +
            '</div>';
        });
        html += '</div>';

        document.getElementById('heartbeat-modal-content').innerHTML = html;
      } catch (err) {
        document.getElementById('heartbeat-modal-content').innerHTML =
          '<div class="error-state"><i class="fa-solid fa-triangle-exclamation"></i> Errore: ' + esc(err.message) + '</div>';
      }
    }

    export function closeHeartbeatModal() {
      const overlay = document.getElementById('heartbeat-modal');
      if (!overlay) return;
      overlay.classList.remove('open');
    }

    // ── Binding overlay / ESC (sostituisce gli onclick inline) ───
    export function initModals() {
      const bindings = [
        ['skill-modal', closeSkillModal],
        ['soul-modal', closeSoulModal],
        ['heartbeat-modal', closeHeartbeatModal],
      ];
      bindings.forEach(([id, closeFn]) => {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        // Click sullo sfondo → chiudi
        overlay.addEventListener('click', e => {
          if (e.target === overlay) closeFn();
        });
        // Click sul contenuto → non propagare
        const box = overlay.querySelector('.skill-modal');
        if (box) box.addEventListener('click', e => e.stopPropagation());
        // Pulsante ×
        const closeBtn = overlay.querySelector('.skill-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', () => closeFn());
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          closeSkillModal();
          closeSoulModal();
          closeHeartbeatModal();
        }
      });
    }
