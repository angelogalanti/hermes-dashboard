    // ── kanban.js — board, card, archiviazione ───────────────────────
    import { esc, shortId, timeAgo } from './utils.js';
    import { fetchJSON } from './api.js';
    import { confirmDialog, alertDialog } from './modals.js';

    // Indice id → task (ultimo render): il click apre il dettaglio senza fetch
    let byId = {};

    const COLUMNS = [
      { id: 'todo',    label: 'Todo',    icon: 'fa-solid fa-pen' },
      { id: 'ready',   label: 'Ready',   icon: 'fa-solid fa-check-double' },
      { id: 'running', label: 'Running', icon: 'fa-solid fa-play' },
      { id: 'blocked', label: 'Blocked', icon: 'fa-solid fa-ban' },
      { id: 'done',    label: 'Done',    icon: 'fa-solid fa-check' },
    ];

    // Task con status sconosciuto (incluso il vecchio 'triage') → Todo
    const FALLBACK_COLUMN = 'todo';

    // ── Struttura vuota della board ──────────────────────────────
    export function buildBoard(boardEl) {
      boardEl.innerHTML = COLUMNS.map(col => {
        const cls = 'kanban-column col-' + col.id;
        return '<div class="' + cls + '" data-col="' + col.id + '">' +
          '<div class="kanban-column-header">' +
          '<i class="' + col.icon + '"></i> ' + esc(col.label) +
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

    // ── Skeleton di caricamento ──────────────────────────────────
    export function renderKanbanSkeleton(boardEl) {
      COLUMNS.forEach(col => {
        const cardsEl = document.getElementById('cards-' + col.id);
        const emptyEl = document.getElementById('empty-' + col.id);
        if (!cardsEl) return;
        if (emptyEl) emptyEl.style.display = 'none';
        cardsEl.querySelectorAll('.kanban-card').forEach(e => e.remove());
        for (let i = 0; i < 2; i++) {
          const sk = document.createElement('div');
          sk.className = 'kanban-card skeleton';
          sk.innerHTML = '<div class="skeleton-line" style="width:80%"></div>' +
            '<div class="skeleton-line" style="width:50%"></div>';
          cardsEl.appendChild(sk);
        }
      });
    }

    // ── Errore di caricamento (con retry) ────────────────────────
    export function renderKanbanError(boardEl, message) {
      boardEl.innerHTML =
        '<div class="section-error">' +
        '<i class="fas fa-triangle-exclamation"></i>' +
        '<span>Kanban non caricato: ' + esc(message) + '</span>' +
        '<button class="retry-btn" data-retry="fast"><i class="fas fa-rotate-right"></i> Riprova</button>' +
        '</div>';
    }

    // ── Heartbeat helpers ────────────────────────────────────────
    function getHeartbeatClass(lastHb) {
      if (!lastHb) return 'stale';
      const diff = (Date.now() - lastHb * 1000) / 1000;
      if (diff < 120) return 'alive';
      if (diff < 300) return 'slow';
      return 'stale';
    }

    function formatHeartbeat(lastHb) {
      if (!lastHb) return 'nessun heartbeat';
      const ago = timeAgo(new Date(lastHb * 1000).toISOString());
      return 'heartbeat ' + ago;
    }

    function getProfileModel(assignee, profiles) {
      if (!assignee || !profiles) return null;
      const p = profiles.find(p => p.name === assignee);
      return p ? (p.model || null) : null;
    }

    function formatElapsed(unixTs) {
      if (!unixTs) return '';
      const diff = Math.floor(Date.now() / 1000 - unixTs);
      if (diff < 60) return 'ora';
      if (diff < 3600) return Math.floor(diff / 60) + 'm';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      return Math.floor(diff / 86400) + 'g';
    }

    // ── Render board ─────────────────────────────────────────────
    export function renderKanbanBoard(boardEl, tasks, profiles) {
      // Ricostruisce le colonne se un errore precedente le ha sostituite
      if (!document.getElementById('cards-todo')) buildBoard(boardEl);

      const groups = {};
      COLUMNS.forEach(c => { groups[c.id] = []; });

      tasks.forEach(t => {
        const s = (t.status || 'todo').toLowerCase();
        if (groups[s]) {
          groups[s].push(t);
        } else {
          groups[FALLBACK_COLUMN].push(t);
        }
      });

      // Running: il più vecchio (started_at) primo — quello che rischia di marcire si vede subito
      groups.running.sort((a, b) => (a.started_at || a.created_at || '') < (b.started_at || b.created_at || '') ? -1 : 1);

      // Indice id → task per il click (apre dettaglio senza fetch)
      byId = {};
      tasks.forEach(t => { byId[String(t.id)] = t; });

      COLUMNS.forEach(col => {
        const colTasks = groups[col.id];
        const cardsEl  = document.getElementById('cards-' + col.id);
        const countEl  = document.getElementById('count-' + col.id);
        const emptyEl  = document.getElementById('empty-' + col.id);
        if (!cardsEl || !countEl || !emptyEl) return; // board in stato errore
        const colEl    = cardsEl.closest('.kanban-column');

        countEl.textContent = colTasks.length;
        if (colEl) colEl.classList.toggle('col-empty', colTasks.length === 0);

        cardsEl.querySelectorAll('.kanban-card').forEach(e => e.remove());
        if (!colTasks.length) {
          emptyEl.style.display = 'block';
          return;
        }
        emptyEl.style.display = 'none';

        colTasks.forEach(t => {
          const card = document.createElement('div');
          card.className = 'kanban-card' + ((col.id === 'blocked' || col.id === 'done') ? ' archive' : '');
          card.dataset.taskId = t.id || '';
          card.style.cursor = 'pointer';
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');

          let archiveBtn = '';
          if (col.id === 'blocked' || col.id === 'done') {
            archiveBtn = '<button class="kanban-card-archive" title="Archivia task" data-archive-id="' + esc(t.id) + '"><i class="fa-solid fa-box-archive"></i></button>';
          }

          let hbHtml = '';
          let hbNoteHtml = '';
          if (t.status === 'running' || t.status === 'blocked') {
            const hbClass = getHeartbeatClass(t.last_heartbeat_at);
            hbHtml = '<span class="kanban-card-heartbeat ' + hbClass + '">' +
              '<i class="fa-solid fa-circle"></i> ' +
              esc(formatHeartbeat(t.last_heartbeat_at)) +
              '</span>';
            if (t.last_heartbeat_note) {
              hbNoteHtml = '<div class="kanban-card-hb-note" title="' + esc(t.last_heartbeat_note) + '">' +
                '<i class="fa-solid fa-comment"></i> ' + esc(t.last_heartbeat_note) +
                '</div>';
            }
          }

          let modelHtml = '';
          const model = t.model_override || getProfileModel(t.assignee, profiles);
          if (model) {
            modelHtml = '<span class="kanban-card-model">' +
              '<i class="fa-solid fa-microchip"></i> ' + esc(model) +
              '</span>';
          }

          let hbCountHtml = '';
          if (t.heartbeat_count && t.heartbeat_count > 0) {
            hbCountHtml = '<span class="kanban-card-hbcount">' +
              '<i class="fa-solid fa-heart-pulse"></i> ' + esc(String(t.heartbeat_count)) +
              '</span>';
          }

          let elapsedHtml = '';
          if ((t.status === 'running' || t.status === 'blocked') && t.started_at) {
            elapsedHtml = '<span class="kanban-card-elapsed">' +
              '<i class="fa-regular fa-clock"></i> ' + esc(formatElapsed(t.started_at)) +
              '</span>';
          }

          let ocHtml = '';
          if (t.used_opencode === true || t.used_opencode === 'true') {
            ocHtml = '<span class="kanban-card-oc"><i class="fa-solid fa-bolt"></i> opencode</span>';
          } else if (t.used_opencode === false || t.used_opencode === 'false') {
            ocHtml = '<span class="kanban-card-oc no-oc"><i class="fa-solid fa-pen"></i> direct</span>';
          }

          // Badge priorità (scala 0-100, 999/null = non impostata → nascosto)
          let prioHtml = '';
          const pNum = t.priority === null || t.priority === undefined ? NaN : Number(t.priority);
          if (Number.isFinite(pNum) && pNum !== 999) {
            let prioCls = 'prio-low';
            if (pNum >= 80)      prioCls = 'prio-high';
            else if (pNum >= 50) prioCls = 'prio-med';
            prioHtml = '<span class="kanban-card-prio ' + prioCls + '" title="Priorità ' + esc(String(t.priority)) + '">' +
              '<i class="fa-solid fa-flag"></i> P' + esc(String(t.priority)) +
              '</span>';
          }

          card.innerHTML =
            archiveBtn +
            '<div class="kanban-card-title">' + esc(t.title) + '</div>' +
            '<div class="kanban-card-meta">' +
            '<span class="kanban-card-id">' + esc(shortId(t.id)) + '</span>' +
            '<span class="kanban-card-assignee">' +
            '<i class="fa-solid fa-user"></i> ' + esc(t.assignee || '-') +
            '</span>' +
            '</div>' +
            '<div class="kanban-card-footer">' +
            hbHtml + elapsedHtml + modelHtml + ocHtml + prioHtml + hbCountHtml +
            '</div>' +
            hbNoteHtml;
          cardsEl.appendChild(card);
        });
      });
    }

    // ── Archiviazione task ───────────────────────────────────────
    async function archiveTask(taskId, onChanged) {
      if (!await confirmDialog('Archiviare il task ' + taskId + '?', {
        title: 'Archivia task', okText: 'Archivia',
      })) return;
      try {
        const resp = await fetch('/api/kanban/archive/' + encodeURIComponent(taskId), {
          method: 'POST',
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        await onChanged();
      } catch (err) {
        console.error('Errore archiviazione task:', err);
        await alertDialog('Archiviazione fallita: ' + err.message);
      }
    }

    // ── Delegation click (niente onclick inline) ─────────────────
    export function initKanban(boardEl, { onChanged, onOpenTask }) {
      boardEl.addEventListener('click', e => {
        const retryBtn = e.target.closest('[data-retry]');
        if (retryBtn) return; // gestito dall'orchestratore in app.js
        const archBtn = e.target.closest('[data-archive-id]');
        if (archBtn) {
          e.stopPropagation();
          archiveTask(archBtn.dataset.archiveId, onChanged);
          return;
        }
        const card = e.target.closest('.kanban-card[data-task-id]');
        if (card && card.dataset.taskId) onOpenTask(byId[card.dataset.taskId]);
      });
      // Tastiera: Enter/Spazio apre il dettaglio (stesso pattern delle righe profilo)
      boardEl.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.kanban-card[data-task-id]')) {
          e.preventDefault();
          onOpenTask(byId[e.target.dataset.taskId]);
        }
      });
    }
