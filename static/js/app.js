    // ── app.js — orchestratore dashboard (modulo ES) ───────────────
    //
    // Refresh intelligente:
    // - veloce (10s): /api/status → kanban + profili + skill
    // - lento (5min): bundles + credits + usage in parallelo
    // - 304 Not Modified (ETag) → nessun re-render: modal aperti,
    //   scroll e righe espanse restano intatti.

    import { fetchJSON, NOT_MODIFIED, dropEtag } from './api.js';
    import { fmtAge } from './utils.js';
    import {
      buildBoard, renderKanbanBoard, renderKanbanSkeleton,
      renderKanbanError, initKanban,
    } from './kanban.js';
    import {
      renderProfiles, renderProfilesSkeleton, renderProfilesError,
      renderSkillListByProfile, renderSkillMatrixShared,
      renderSkillPrimary, renderSkillBundles, renderSectionError,
      initSkills,
    } from './skills.js';
    import {
      renderCredits, renderOpenCodeUsage,
      renderUsageSkeleton, renderUsageError, markStale,
    } from './widgets.js';
    import {
      openSkillModal, openSoulModal, openAgentsModal,
      openHeartbeatModal, initModals,
    } from './modals.js';

    const FAST_INTERVAL = 10000;
    const SLOW_INTERVAL = 300000; // 5 min (allineato alle cache backend)

    // ── DOM refs ─────────────────────────────────────────────────
    const profilesBody = document.getElementById('profiles-body');
    const kanbanBoard  = document.getElementById('kanban-board');
    const lastUpdateEl = document.getElementById('last-update');
    const refreshBtn   = document.getElementById('refresh-btn');
    const healthBtn    = document.getElementById('health-btn');
    const skillLocalContent   = document.getElementById('skill-local-content');
    const skillSharedContent  = document.getElementById('skill-shared-content');
    const skillPrimaryContent = document.getElementById('skill-primary-content');
    const skillBundlesContent = document.getElementById('skill-bundles-content');
    const creditsBadge = document.getElementById('credits-badge');
    const usageContainer = document.getElementById('opencode-usage');

    // Primo caricamento riuscito per sezione (errori → box solo se mai visti dati)
    const hasData = { fast: false, bundles: false, credits: false, usage: false };

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
        renderKanbanBoard(kanbanBoard, data.kanban || [], data.profiles || []);
        renderProfiles(profilesBody, data.profiles || []);
        renderSkillListByProfile(skillLocalContent, data.profiles || [], openSkillModal);
        renderSkillMatrixShared(skillSharedContent, data.profiles || [], openSkillModal);
        renderSkillPrimary(skillPrimaryContent, data.profiles || [], openSkillModal);
        hasData.fast = true;
        touchLastUpdate();
      } catch (err) {
        console.error('refreshFast:', err);
        if (!hasData.fast) {
          renderKanbanError(kanbanBoard, err.message);
          renderProfilesError(profilesBody, err.message);
          renderSectionError(skillLocalContent, 'Skill locali', err.message, 'fast');
          renderSectionError(skillSharedContent, 'Skill condivise', err.message, 'fast');
          renderSectionError(skillPrimaryContent, 'Skill primarie', err.message, 'fast');
        }
      } finally {
        refreshBtn.classList.remove('loading');
      }
    }

    // ── Refresh lento: bundles + credits + usage in parallelo ───
    async function refreshSlow() {
      const [bundlesRes, creditsRes, usageRes] = await Promise.allSettled([
        fetchJSON('/api/skill-bundles'),
        fetchJSON('/api/credits'),
        fetchJSON('/api/opencode-usage'),
      ]);

      // Bundles
      if (bundlesRes.status === 'fulfilled') {
        if (bundlesRes.value !== NOT_MODIFIED) {
          renderSkillBundles(skillBundlesContent, bundlesRes.value, openSkillModal);
          hasData.bundles = true;
        }
      } else if (!hasData.bundles) {
        renderSectionError(skillBundlesContent, 'Skill bundles', bundlesRes.reason.message, 'slow');
      } else {
        console.error('bundles:', bundlesRes.reason);
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

      // Usage
      if (usageRes.status === 'fulfilled') {
        if (usageRes.value !== NOT_MODIFIED) {
          renderOpenCodeUsage(usageContainer, usageRes.value);
          hasData.usage = true;
        }
      } else {
        renderUsageError(usageContainer, usageRes.reason.message);
      }
    }

    // ── Refresh manuale (pulsante) ───────────────────────────────
    async function refreshAll() {
      await Promise.allSettled([refreshFast(), refreshSlow()]);
    }

    // ── Test health (con conferma: chiama API esterne) ──────────
    async function testHealth() {
      healthBtn.classList.add('loading');
      healthBtn.disabled = true;
      try {
        // Età dell'ultimo test (risposta cachata, economica) per il confirm
        let ageTxt = 'sconosciuta';
        try {
          const cached = await fetchJSON('/api/health', { retries: 0 });
          if (cached && cached !== NOT_MODIFIED && cached._ts) {
            ageTxt = fmtAge(cached._ts);
            const btn = healthBtn;
            if (btn) btn.title = 'Ultimo test: ' + ageTxt;
          }
        } catch (e) { /* si procede comunque al test */ }
        if (!confirm('Lanciare il test health sui provider? (ultimo test: ' + ageTxt + ')')) return;
        dropEtag('/api/status');
        await fetchJSON('/api/health?force=1');
        await refreshAll();
      } catch (err) {
        console.error('Health test failed:', err);
      } finally {
        healthBtn.disabled = false;
        healthBtn.classList.remove('loading');
      }
    }

    // ── Init ─────────────────────────────────────────────────────
    buildBoard(kanbanBoard);
    initModals();
    initKanban(kanbanBoard, {
      onChanged: () => refreshFast(),
      onOpenHeartbeats: (taskId) => openHeartbeatModal(taskId),
    });
    initSkills({
      onChanged: () => refreshFast(),
      onOpenSkill: (sk, profile, type) => openSkillModal(sk, profile, type),
      onOpenSoul: (name) => openSoulModal(name),
      onOpenAgents: (name) => openAgentsModal(name),
    });

    // Controlli statici
    refreshBtn.addEventListener('click', () => refreshAll());
    healthBtn.addEventListener('click', () => testHealth());

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
    renderUsageSkeleton(usageContainer);

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
