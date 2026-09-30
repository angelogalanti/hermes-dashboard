    // ── modals.js — skill / SOUL-AGENTS / heartbeat ────────────────
    import { esc, shortId, timeAgo } from './utils.js';
    import { fetchJSON } from './api.js';
    import { getSkillActivity } from './skills.js';

    // ── Skill Modal ──────────────────────────────────────────────
    export function openSkillModal(skillObj, profileName, type) {
      const overlay = document.getElementById('skill-modal');
      if (!overlay) return;

      if (typeof skillObj === 'string') {
        try { skillObj = JSON.parse(skillObj); } catch (e) { return; }
      }

      const statsEl = overlay.querySelector('.skill-modal-stats');
      const datesEl = overlay.querySelector('.skill-modal-dates');
      const stateEl = document.getElementById('modal-state');
      const pinnedEl = document.getElementById('modal-pinned');

      if (statsEl) statsEl.style.display = 'grid';
      if (datesEl) datesEl.style.display = 'flex';
      if (stateEl) stateEl.style.display = 'inline-flex';

      document.getElementById('modal-use-count').textContent = skillObj.use_count || 0;
      document.getElementById('modal-view-count').textContent = skillObj.view_count || 0;
      document.getElementById('modal-patch-count').textContent = skillObj.patch_count || 0;

      const act = getSkillActivity(skillObj);
      const state = skillObj.state || 'active';
      stateEl.className = 'skill-modal-state ' + (state === 'active' ? 'active' : 'inactive');
      stateEl.innerHTML = '<i class="fa-solid fa-circle"></i> ' + esc(state.charAt(0).toUpperCase() + state.slice(1));

      let actEl = document.getElementById('modal-act-tag');
      if (!actEl) {
        actEl = document.createElement('div');
        actEl.id = 'modal-act-tag';
        actEl.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 10px;border-radius:12px;margin-bottom:18px;margin-left:8px;';
        stateEl.parentNode.insertBefore(actEl, stateEl.nextSibling);
      }
      if (act && act.state !== 'unused') {
        actEl.style.display = 'inline-flex';
        actEl.style.background = 'rgba(255,255,255,0.06)';
        actEl.style.border = '1px solid ' + act.color + '44';
        actEl.style.color = act.color;
        actEl.innerHTML = esc(act.label) + (act.badge ? ' &middot; ' + esc(act.badge) : '') + ' &middot; <span style="color:#8b949e;">calore: ' + act.score + '/100</span>';
      } else {
        actEl.style.display = 'inline-flex';
        actEl.style.background = 'rgba(255,255,255,0.04)';
        actEl.style.border = '1px solid #30363d';
        actEl.style.color = '#8b949e';
        actEl.textContent = 'Mai usata';
      }

      setModalDate('modal-created-at', skillObj.created_at);
      setModalDate('modal-last-used-at', skillObj.last_used_at);
      setModalDate('modal-last-viewed-at', skillObj.last_viewed_at);
      setModalDate('modal-last-patched-at', skillObj.last_patched_at);

      if (skillObj.pinned) {
        pinnedEl.style.display = 'inline-flex';
      } else {
        pinnedEl.style.display = 'none';
      }

      document.getElementById('modal-name').textContent = skillObj.name || '';
      document.getElementById('modal-category').textContent = skillObj.category || '(senza categoria)';

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
        profileSpan.textContent = 'Skill generalist — solo default e ceo';
      } else if (type === 'frontline') {
        profileSpan.textContent = 'Skill frontline — default, ceo e teacher';
      } else if (type === 'worker') {
        profileSpan.textContent = 'Skill worker — coder e researcher';
      } else if (type === 'operator') {
        profileSpan.textContent = 'Skill operator — default e coder';
      } else if (type === 'shared') {
        profileSpan.textContent = 'Skill condivisa — presente in tutti i profili';
      }
      // Fonte delle scaricate: author + link verificato (solo se presenti in API)
      if (skillObj.source && skillObj.source.author) {
        const srcUrl = skillObj.source.url && skillObj.source.url.startsWith('https://')
          ? skillObj.source.url : null;
        profileSpan.innerHTML = esc(profileSpan.textContent) + ' · Fonte: ' +
          (srcUrl
            ? '<a href="' + esc(srcUrl) + '" target="_blank" rel="noopener" style="color:#58a6ff;">' + esc(skillObj.source.author) + ' ↗</a>'
            : esc(skillObj.source.author));
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
    export async function openHeartbeatModal(taskId, task) {
      const overlay = document.getElementById('heartbeat-modal');
      if (!overlay) return;

      document.getElementById('heartbeat-modal-title').textContent =
        'Heartbeat \u2014 ' + shortId(taskId) + (task && task.title ? ' \u00b7 ' + task.title : '');
      var taskSummary = '';
      if (task) {
        taskSummary = '<div class="hb-task-summary">' +
          '<strong>' + esc(task.title || '(senza titolo)') + '</strong>' +
          '<span>' + esc(task.status || '') + ' \u00b7 ' + esc(task.assignee || task.profile || '') +
          ((task.priority !== undefined && task.priority !== null && task.priority !== 999) ? ' \u00b7 P' + esc(String(task.priority)) : '') + '</span>' +
          '</div>';
      }
      document.getElementById('heartbeat-modal-content').innerHTML = taskSummary +
        '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Caricamento...</div>';
      overlay.classList.add('open');

      try {
        const data = await fetchJSON('/api/kanban/' + encodeURIComponent(taskId) + '/heartbeats', { retries: 1 });

        if (!data.heartbeats || data.heartbeats.length === 0) {
          document.getElementById('heartbeat-modal-content').innerHTML =
            taskSummary +
            '<div class="empty-state"><i class="fa-solid fa-heart-circle-minus"></i> Nessun heartbeat registrato</div>';
          return;
        }

        let html = taskSummary + '<div class="hb-summary">' +
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

    // ── Confirm / Alert dialog (sostituisce confirm()/alert() nativi) ──
    let confirmResolve = null;

    function closeConfirmModal(result) {
      const overlay = document.getElementById('confirm-modal');
      if (overlay) overlay.classList.remove('open');
      if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
      }
    }

    export function confirmDialog(message, { title = 'Conferma', okText = 'Conferma', danger = false, hideCancel = false } = {}) {
      const overlay = document.getElementById('confirm-modal');
      if (!overlay) return Promise.resolve(window.confirm(message)); // fallback
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message || '';
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');
      okBtn.textContent = okText;
      okBtn.classList.toggle('danger', danger);
      cancelBtn.style.display = hideCancel ? 'none' : '';
      overlay.classList.add('open');
      (hideCancel ? okBtn : cancelBtn).focus();
      return new Promise(resolve => { confirmResolve = resolve; });
    }

    export function alertDialog(message) {
      return confirmDialog(message, { title: 'Errore', okText: 'Chiudi', hideCancel: true });
    }

    // ── Task Detail Modal (riusa il guscio heartbeat) ─────────────
    // Running/Blocked → timeline heartbeat; gli altri → dettaglio task (dati già in memoria).
    export function openTaskModal(task) {
      if (!task) return;
      if (task.status === 'running' || task.status === 'blocked') {
        return openHeartbeatModal(task.id, task);
      }
      const overlay = document.getElementById('heartbeat-modal');
      if (!overlay) return;

      document.getElementById('heartbeat-modal-title').textContent = 'Task — ' + shortId(task.id);
      const row = (label, value) =>
        '<div class="skill-modal-date"><span>' + label + '</span><strong>' + value + '</strong></div>';
      const fmtDate = iso => iso ? esc(new Date(iso).toLocaleString('it-IT')) : '<span style="color:#484f58;">—</span>';
      document.getElementById('heartbeat-modal-content').innerHTML =
        '<div class="skill-modal-dates">' +
        row('Titolo', esc(task.title || '(senza titolo)')) +
        row('Stato', esc(task.status || '—')) +
        row('Assignee', esc(task.assignee || task.profile || '—')) +
        row('Modello', esc(task.model || '—')) +
        row('Priorità', esc(String(task.priority ?? '—'))) +
        row('Heartbeat', esc(String(task.heartbeat_count ?? 0))) +
        row('Creato', fmtDate(task.created_at)) +
        row('Avviato', fmtDate(task.started_at)) +
        row('Completato', fmtDate(task.completed_at)) +
        (task.last_note ? row('Ultima nota', esc(task.last_note)) : '') +
        '</div>';
      overlay.classList.add('open');
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
          closeConfirmModal(false);
        }
      });

      // Confirm modal: bottoni + click sfondo
      const confirmOverlay = document.getElementById('confirm-modal');
      if (confirmOverlay) {
        document.getElementById('confirm-ok').addEventListener('click', () => closeConfirmModal(true));
        document.getElementById('confirm-cancel').addEventListener('click', () => closeConfirmModal(false));
        confirmOverlay.addEventListener('click', e => {
          if (e.target === confirmOverlay) closeConfirmModal(false);
        });
      }
    }
