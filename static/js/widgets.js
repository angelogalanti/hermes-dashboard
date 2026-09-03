    // ── widgets.js — credits badge, OpenCode usage ───────────────────
    import { esc, fmtAge } from './utils.js';

    // ── Badge "aggiornato X min fa" ──────────────────────────────
    // Ogni widget tiene in dataset.ts il _ts dell'ultimo payload valido.
    function staleBadgeHTML(ts) {
      return '<span class="stale-badge" title="Freschezza dati">· ' + esc(fmtAge(ts)) + '</span>';
    }

    export function rememberTs(container, ts) {
      if (ts) container.dataset.ts = String(ts);
    }

    // Segna il widget come non aggiornato (fetch fallito, dati vecchi tenuti)
    export function markStale(container) {
      const badge = container.querySelector('.stale-badge');
      const ts = container.dataset.ts ? Number(container.dataset.ts) : null;
      if (badge) {
        badge.classList.add('warn');
        badge.textContent = ts
          ? '· non aggiornato — dati di ' + fmtAge(ts).replace('aggiornato ', '')
          : '· non aggiornato';
      }
    }

    // ── Credits badge ────────────────────────────────────────────
    export function renderCredits(badge, data) {
      if (!badge) return;
      rememberTs(badge, data && data._ts);

      if (!data || !data.services) {
        badge.innerHTML = '';
        badge.className = 'credits-badge';
        return;
      }

      const services = data.services;
      const parts = [];

      // Tavily
      const tavily = services.tavily || {};
      if (tavily.status === 'ok' && tavily.percentage !== null && tavily.percentage !== undefined) {
        const pct = tavily.percentage;
        let dotClass, dotChar;
        if (pct < 60)       { dotClass = 'green';  dotChar = '\u{1F7E2}'; }
        else if (pct < 80)  { dotClass = 'yellow'; dotChar = '\u{1F7E1}'; }
        else if (pct < 95)  { dotClass = 'orange'; dotChar = '\u{1F7E0}'; }
        else                { dotClass = 'red';    dotChar = '\u{1F534}'; }

        parts.push(
          '<span class="credit-service">' +
          '<span class="credit-dot ' + dotClass + '">' + dotChar + '</span>' +
          'Tavily ' + esc(String(pct)) + '%' +
          '</span>'
        );
        badge.classList.toggle('warning', pct > 80);
      } else if (tavily.status === 'unconfigured') {
        parts.push(
          '<span class="credit-service" style="color:#484f58;">' +
          '<span class="credit-dot grey">\u{2B1B}</span>' +
          'Tavily \u2014' +
          '</span>'
        );
      } else {
        parts.push(
          '<span class="credit-service" style="color:#484f58;">' +
          '<span class="credit-dot grey">\u{2B1B}</span>' +
          'Tavily err' +
          '</span>'
        );
      }

      // Exa
      const exa = services.exa || {};
      if (exa.status === 'ok') {
        parts.push(
          '<span class="credit-service">' +
          '<span class="credit-dot green">\u{1F7E2}</span>' +
          'Exa' +
          '</span>'
        );
      } else {
        parts.push(
          '<span class="credit-service" style="color:#484f58;">' +
          '<span class="credit-dot grey">\u{2B1B}</span>' +
          'Exa' +
          '</span>'
        );
      }

      badge.innerHTML = parts.join('<span class="credit-sep">\u{25FB}</span>') +
        (data._ts ? staleBadgeHTML(data._ts) : '');
    }

    // ── OpenCode Usage ───────────────────────────────────────────
    const WINDOW_ORDER = ['5-hour Usage', 'Rolling Usage', 'Weekly Usage', 'Monthly Usage'];

    export function renderOpenCodeUsage(container, data) {
      if (!container) return;
      rememberTs(container, data && data._ts);

      if (!data || !data.accounts || !data.accounts.length) {
        container.innerHTML = '<span class="opencode-error"><i class="fa-regular fa-circle-question"></i> OpenCode usage non disponibile</span>' +
          '<button class="retry-btn" data-retry="slow"><i class="fas fa-rotate-right"></i> Riprova</button>';
        return;
      }

      container.innerHTML = '';

      data.accounts.forEach(acc => {
        const section = document.createElement('div');
        section.className = 'oc-account';

        const heading = document.createElement('h3');
        const bolt = document.createElement('i');
        bolt.className = 'fa-solid fa-bolt';
        heading.appendChild(bolt);
        heading.appendChild(document.createTextNode(' ' + acc.name + ' '));
        if (data._ts) {
          const badge = document.createElement('span');
          badge.className = 'stale-badge';
          badge.title = 'Freschezza dati';
          badge.textContent = '· ' + fmtAge(data._ts);
          heading.appendChild(badge);
        }
        section.appendChild(heading);

        const cardsWrap = document.createElement('div');
        cardsWrap.className = 'oc-cards';

        const windows = acc.windows || {};
        WINDOW_ORDER.forEach(key => {
          const w = windows[key];
          if (!w) return;

          const pct = w.pct || 0;
          const pctInt = Math.round(pct);

          let level = 'low';
          if (pct >= 95)      level = 'critical';
          else if (pct >= 80) level = 'high';
          else if (pct >= 60) level = 'medium';

          const card = document.createElement('div');
          card.className = 'oc-card';
          card.innerHTML =
            '<div class="oc-card-label">' + esc(key) + '</div>' +
            '<div class="oc-card-pct ' + level + '">' + pctInt + '%</div>' +
            '<div class="oc-bar"><div class="oc-bar-fill ' + level + '" style="width:' + pctInt + '%"></div></div>' +
            '<div class="oc-card-reset"><i class="fa-regular fa-clock"></i> ' + esc(w.resets_in || '—') + '</div>';
          cardsWrap.appendChild(card);
        });

        section.appendChild(cardsWrap);
        container.appendChild(section);
      });
    }

    export function renderUsageSkeleton(container) {
      if (!container) return;
      container.innerHTML =
        '<div class="oc-account"><h3><i class="fa-solid fa-bolt"></i> OpenCode</h3>' +
        '<div class="oc-cards">' +
        '<div class="oc-card"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%"></div></div>' +
        '<div class="oc-card"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%"></div></div>' +
        '<div class="oc-card"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:40%"></div></div>' +
        '</div></div>';
    }

    export function renderUsageError(container, message) {
      if (!container) return;
      if (container.dataset.ts) {
        // Abbiamo dati vecchi: li teniamo e segnaliamo solo il mancato update
        markStale(container);
        return;
      }
      container.innerHTML =
        '<div class="section-error">' +
        '<span class="opencode-error"><i class="fa-regular fa-circle-question"></i> OpenCode usage non disponibile: ' + esc(message) + '</span>' +
        '<button class="retry-btn" data-retry="slow"><i class="fas fa-rotate-right"></i> Riprova</button>' +
        '</div>';
    }
