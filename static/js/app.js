    // ── app.js — orchestratore dashboard (modulo ES) ───────────────
    //
    // Refresh intelligente:
    // - veloce (10s): /api/status → kanban + profili + skill
    // - lento (5min): credits + usage + health in parallelo
    // - 304 Not Modified (ETag) → nessun re-render: modal aperti,
    //   scroll e righe espanse restano intatti.

    import { fetchJSON, NOT_MODIFIED, dropEtag } from './api.js';
    import {
      buildBoard, renderKanbanBoard, renderKanbanSkeleton,
      renderKanbanError, initKanban,
    } from './kanban.js';
    import {
      renderProfiles, renderProfilesSkeleton, renderProfilesError,
      renderSkillListByProfile, renderSkillMatrixShared, renderSkillMatrixFrontline,
      renderSkillMatrixWorker, renderSkillMatrixOperator,
      renderSkillPrimary, renderSectionError,
      renderSkillMap,
      setLocalFilterHold, restoreLocalDetails,
      initSkills,
      updateSkillsActivityContext, getSkillSortMode, setSkillSortMode,
    } from './skills.js';
    import {
      renderCredits, renderUsageCompact,
      renderGatewayPill, renderHealthPill,
      renderUsageCompactSkeleton, renderUsageCompactError, markStale,
    } from './widgets.js';
    import {
      openSkillModal, openSoulModal, openAgentsModal,
      openTaskModal, initModals,
    } from './modals.js';

    const FAST_INTERVAL = 10000;
    const SLOW_INTERVAL = 300000; // 5 min (allineato alle cache backend)

    // ── DOM refs ─────────────────────────────────────────────────
    const profilesBody = document.getElementById('profiles-body');
    const kanbanBoard  = document.getElementById('kanban-board');
    const lastUpdateEl = document.getElementById('last-update');
    const refreshBtn   = document.getElementById('refresh-btn');
    const skillLocalContent   = document.getElementById('skill-local-content');
    const skillSharedContent  = document.getElementById('skill-shared-content');
    const skillFrontlineContent = document.getElementById('skill-frontline-content');
    const skillWorkerContent = document.getElementById('skill-worker-content');
    const skillOperatorContent = document.getElementById('skill-operator-content');
    const skillPrimaryContent = document.getElementById('skill-primary-content');
    const skillSortSelect = document.getElementById('skill-sort-select');
    const creditsBadge = document.getElementById('credits-badge');
    const usageBadge = document.getElementById('usage-badge');
    const gatewayPill = document.getElementById('gateway-pill');
    const healthPill = document.getElementById('health-pill');

    // Ultimo snapshot dei profili per re-render immediato su cambio ordinamento
    let _latestProfiles = [];

    function renderAllSkillSections(profiles) {
      updateSkillsActivityContext(profiles);
      renderSkillListByProfile(skillLocalContent, profiles, openSkillModal);
      renderSkillMatrixShared(skillSharedContent, profiles, openSkillModal);
      renderSkillMatrixFrontline(skillFrontlineContent, profiles, openSkillModal);
      renderSkillMatrixWorker(skillWorkerContent, profiles, openSkillModal);
      renderSkillMatrixOperator(skillOperatorContent, profiles, openSkillModal);
      renderSkillPrimary(skillPrimaryContent, profiles, openSkillModal);
      renderSkillMap(profiles);
    }

    // Primo caricamento riuscito per sezione (errori → box solo se mai visti dati)
    const hasData = { fast: false, credits: false, usage: false };

    // ── Ultimo aggiornamento ─────────────────────────────────────
    function touchLastUpdate() {
      lastUpdateEl.textContent = 'Ultimo aggiornamento: ' +
        new Date().toLocaleTimeString('it-IT');
    }

    // ── Refresh veloce: status → kanban + profili + skill ────────
    async function refreshFast() {
      refreshBtn.classList.add('loading');
      try {
        const data = await fetchJSON('/api/status');
        if (data === NOT_MODIFIED) {
          touchLastUpdate();
          return;
        }
        _latestProfiles = data.profiles || [];
        renderKanbanBoard(kanbanBoard, data.kanban || [], _latestProfiles);
        renderProfiles(profilesBody, _latestProfiles);
        renderGatewayPill(gatewayPill, _latestProfiles);
        renderAllSkillSections(_latestProfiles);
        hasData.fast = true;
        touchLastUpdate();
        const fi = document.getElementById('filter-input');
        if (fi && fi.value) fi.dispatchEvent(new Event('input')); // re-applica filtro ai nodi ri-renderizzati
      } catch (err) {
        console.error('refreshFast:', err);
        if (!hasData.fast) {
          renderKanbanError(kanbanBoard, err.message);
          renderProfilesError(profilesBody, err.message);
          renderSectionError(skillLocalContent, 'Skill locali', err.message, 'fast');
          renderSectionError(skillSharedContent, 'Skill condivise', err.message, 'fast');
          renderSectionError(skillFrontlineContent, 'Skill frontline', err.message, 'fast');
          renderSectionError(skillWorkerContent, 'Skill worker', err.message, 'fast');
          renderSectionError(skillOperatorContent, 'Skill operator', err.message, 'fast');
          renderSectionError(skillPrimaryContent, 'Skill generalist', err.message, 'fast');
        }
      } finally {
        refreshBtn.classList.remove('loading');
      }
    }

    // ── Refresh lento: credits + usage + health in parallelo ───
    async function refreshSlow() {
      const [creditsRes, usageRes, healthRes] = await Promise.allSettled([
        fetchJSON('/api/credits'),
        fetchJSON('/api/opencode-usage'),
        fetchJSON('/api/health'),
      ]);

      // Health (senza force: cache <5min gratis, scaduta = un test vero per provider)
      // Se cambiato → pill + invalida ETag status così il prossimo fast re-renderizza
      if (healthRes.status === 'fulfilled' && healthRes.value !== NOT_MODIFIED) {
        renderHealthPill(healthPill, healthRes.value);
        dropEtag('/api/status');
        refreshFast();
      }

      // Credits
      if (creditsRes.status === 'fulfilled') {
        if (creditsRes.value !== NOT_MODIFIED) {
          renderCredits(creditsBadge, creditsRes.value);
          hasData.credits = true;
        }
      } else if (!hasData.credits && creditsBadge) {
        creditsBadge.style.display = '';
        creditsBadge.innerHTML =
          '<span class="credit-service"><span class="status-dot" style="background:#484f58"></span>crediti non disponibili</span>' +
          ' <button class="retry-btn" data-retry="slow"><i class="fas fa-rotate-right"></i></button>';
      } else if (creditsBadge) {
        markStale(creditsBadge);
        console.error('credits:', creditsRes.reason);
      }

      // Usage (pill compatta nella barra controlli)
      if (usageRes.status === 'fulfilled') {
        if (usageRes.value !== NOT_MODIFIED) {
          renderUsageCompact(usageBadge, usageRes.value);
          hasData.usage = true;
        }
      } else if (!hasData.usage) {
        renderUsageCompactError(usageBadge, usageRes.reason.message);
      } else {
        markStale(usageBadge);
        console.error('usage:', usageRes.reason);
      }
      const fi2 = document.getElementById('filter-input');
      if (fi2 && fi2.value) fi2.dispatchEvent(new Event('input')); // re-applica filtro ai nodi ri-renderizzati
    }

    // ── Refresh manuale = force (droppa ETag: ricarica tutto, non solo il cambiato) ──
    async function refreshAll() {
      ['/api/status', '/api/credits', '/api/opencode-usage']
        .forEach(dropEtag);
      await Promise.allSettled([refreshFast(), refreshSlow()]);
    }

    // ── Init ─────────────────────────────────────────────────────
    buildBoard(kanbanBoard);
    initModals();
    initKanban(kanbanBoard, {
      onChanged: () => refreshFast(),
      onOpenTask: (task) => openTaskModal(task),
    });
    initSkills({
      onChanged: () => refreshFast(),
      onOpenSkill: (sk, profile, type) => openSkillModal(sk, profile, type),
      onOpenSoul: (name) => openSoulModal(name),
      onOpenAgents: (name) => openAgentsModal(name),
    });

    // ── Ordinamento skill ─────────────────────────────────────────
    if (skillSortSelect) {
      skillSortSelect.value = getSkillSortMode();
      skillSortSelect.addEventListener('change', () => {
        setSkillSortMode(skillSortSelect.value);
        if (_latestProfiles.length > 0) {
          renderAllSkillSections(_latestProfiles);
          const fi = document.getElementById('filter-input');
          if (fi && fi.value) fi.dispatchEvent(new Event('input'));
        }
      });
    }

    // ── Filtro ricerca (skill + task + profili, nativo; Esc di type=search svuota da solo) ──
    const filterInput = document.getElementById('filter-input');
    const filterCount = document.getElementById('filter-count');
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        const q = filterInput.value.trim().toLowerCase();
        let n = 0;
        document.querySelectorAll('.skill-card, .kanban-card').forEach(el => {
          const show = !q || el.textContent.toLowerCase().includes(q);
          el.style.display = show ? '' : 'none';
          if (q && show) n++;
        });
        document.querySelectorAll('tr.profile-row').forEach(row => {
          const show = !q || row.textContent.toLowerCase().includes(q);
          row.style.display = show ? '' : 'none';
          if (q && show) n++;
        });
        // Sotto-sezioni locali per profilo (<details>): nascondi le svuotate,
        // apri quelle con match; a filtro vuoto ripristina lo stato utente
        setLocalFilterHold(!!q);
        document.querySelectorAll('#skill-local-content details.profile-skills').forEach(det => {
          const vis = [...det.querySelectorAll('.skill-card')].filter(c => c.style.display !== 'none');
          det.style.display = !q || vis.length ? '' : 'none';
          if (q && vis.length) det.open = true;
        });
        if (!q) restoreLocalDetails();
        document.querySelectorAll('#kanban-board .kanban-column').forEach(col => {
          const cards = [...col.querySelectorAll('.kanban-card')].filter(c => c.style.display !== 'none');
          const emptyEl = col.querySelector('.kanban-column-empty');
          const countEl = col.querySelector('.count');
          if (countEl) countEl.textContent = q ? cards.length : col.querySelectorAll('.kanban-card').length;
          if (emptyEl && q) emptyEl.style.display = cards.length ? 'none' : 'block';
        });
        document.querySelectorAll('#skill-shared-content, #skill-frontline-content, #skill-worker-content, #skill-operator-content, #skill-primary-content').forEach(box => {
          const anyVisible = [...box.querySelectorAll('.skill-card')].some(c => c.style.display !== 'none');
          const section = box.closest('section');
          if (!section) return;
          if (!('secDisplay' in box.dataset)) box.dataset.secDisplay = section.style.display; // stato pre-filtro (es. sezione vuota nascosta dal render)
          if (q) section.style.display = anyVisible ? box.dataset.secDisplay || '' : 'none';
          else { section.style.display = box.dataset.secDisplay || ''; delete box.dataset.secDisplay; }
        });
        if (filterCount) filterCount.textContent = q ? (n ? n + ' risultati' : 'nessun risultato') : '';
      });
      // "/" focalizza il filtro (fuori dai campi di testo); Esc lo svuota e sfoca
      document.addEventListener('keydown', e => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
        if (e.key === '/' && !typing) { e.preventDefault(); filterInput.focus(); }
        else if (e.key === 'Escape' && document.activeElement === filterInput && filterInput.value) {
          filterInput.value = '';
          filterInput.dispatchEvent(new Event('input'));
          filterInput.blur();
        }
      });
    }

    // ── Sezioni collassabili (le section sono statiche: lo stato sopravvive ai refresh) ──
    const collapsedSections = new Set(JSON.parse(localStorage.getItem('dash-collapsed') || '[]'));
    document.querySelectorAll('section[id] h2').forEach(h2 => {
      const section = h2.closest('section');
      const chev = document.createElement('i');
      chev.className = 'fa-solid fa-chevron-down section-toggle';
      chev.setAttribute('aria-hidden', 'true');
      h2.appendChild(chev);
      h2.setAttribute('role', 'button');
      h2.setAttribute('tabindex', '0');
      if (collapsedSections.has(section.id)) section.classList.add('collapsed');
      const toggle = () => {
        const collapsed = section.classList.toggle('collapsed');
        if (collapsed) collapsedSections.add(section.id);
        else collapsedSections.delete(section.id);
        try {
          localStorage.setItem('dash-collapsed', JSON.stringify([...collapsedSections]));
        } catch (e) { /* storage non disponibile: lo stato vive solo in memoria */ }
      };
      h2.addEventListener('click', toggle);
      h2.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === h2) {
          e.preventDefault();
          toggle();
        }
      });
    });

    // Controlli statici
    refreshBtn.addEventListener('click', () => refreshAll());

    // Retry delegato per i box di errore
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-retry]');
      if (!btn) return;
      if (btn.dataset.retry === 'fast') refreshFast();
      else if (btn.dataset.retry === 'slow') refreshSlow();
    });

    // Skeleton al primo avvio, poi doppio refresh in parallelo
    renderKanbanSkeleton(kanbanBoard);
    renderProfilesSkeleton(profilesBody);
    renderUsageCompactSkeleton(usageBadge);
    renderHealthPill(healthPill, null);

    let fastTimer = null;
    let slowTimer = null;

    function startAutoRefresh() {
      stopAutoRefresh();
      // I timer scattano solo a tab visibile (niente polling sprecato)
      fastTimer = setInterval(() => { if (!document.hidden) refreshFast(); }, FAST_INTERVAL);
      slowTimer = setInterval(() => { if (!document.hidden) refreshSlow(); }, SLOW_INTERVAL);
    }

    function stopAutoRefresh() {
      if (fastTimer) clearInterval(fastTimer);
      if (slowTimer) clearInterval(slowTimer);
      fastTimer = slowTimer = null;
    }

    // Tab nascosta → stop; al ritorno → refresh immediato + restart timer
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAutoRefresh();
      } else {
        refreshAll();
        startAutoRefresh();
      }
    });

    refreshAll().finally(() => startAutoRefresh());
