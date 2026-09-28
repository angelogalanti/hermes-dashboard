    // ── widgets.js — credits badge, OpenCode usage ───────────────────
    import { esc, fmtAge, fmtAgeShort } from './utils.js';

    // ── Badge "· 3m" (compatto; forma lunga nel title) ──────────────
    // Ogni widget tiene in dataset.ts il _ts dell'ultimo payload valido.
    function staleBadgeHTML(ts) {
      return '<span class="stale-badge" title="' + esc(fmtAge(ts)) + '">· ' + esc(fmtAgeShort(ts)) + '</span>';
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

    // ── Pill gateway (uno solo: default, o primo running) ───────
    export function renderGatewayPill(pill, profiles) {
      if (!pill) return;
      const gw = (profiles || []).find(p => p.name === 'default') ||
        (profiles || []).find(p => p.gateway === 'running' || p.gateway === 'connected');
      if (!gw) {
        pill.style.display = 'none';
        return;
      }
      pill.style.display = '';
      const on = gw.gateway === 'running' || gw.gateway === 'connected';
      const color = on ? '#3fb950' : '#f85149';
      const plats = (gw.platforms || []).join(', ') || '—';
      pill.innerHTML = '<span class="status-dot" style="background:' + color + '"></span>' +
        '<span>Gateway ' + (on ? 'attivo' : 'fermo') + '</span>' +
        (on && gw.platforms && gw.platforms.length ? '<span style="color:#484f58;">· ' + esc(plats) + '</span>' : '');
      pill.title = 'Gateway: ' + (gw.gateway || 'unknown') + ' — piattaforme: ' + plats;
    }

    // ── Pill health provider (aggregata da /api/health) ──────────
    export function renderHealthPill(pill, data) {
      if (!pill) return;
      if (!data || !data.providers || !Object.keys(data.providers).length) {
        pill.style.display = '';
        pill.innerHTML = '<span class="status-dot" style="background:#484f58"></span><span>Health —</span>';
        pill.title = 'In attesa del primo controllo (ogni 5 min) o premi Testa health';
        return;
      }
      pill.style.display = '';
      const entries = Object.entries(data.providers);
      const bad = entries.filter(([, v]) => v && v.ok === false);
      if (!bad.length) {
        pill.innerHTML = '<span class="status-dot" style="background:#3fb950"></span>' +
          '<span>Provider ok (' + entries.length + ')</span>';
        pill.title = entries.map(([k, v]) => k.split(':')[0] + ': ' + (v.latency || '?') + 's').join(' · ');
      } else {
        pill.innerHTML = '<span class="status-dot" style="background:#f85149"></span>' +
          '<span>Provider ko: ' + esc(bad.map(([k]) => k.split(':')[0]).join(', ')) + '</span>';
        pill.title = bad.map(([k, v]) => k + ': ' + (v.error || 'errore')).join(' · ');
      }
    }
    // ── Credits badge ────────────────────────────────────────────
    // Ogni servizio è una pill omogenea: dot colorato + nome + valore.
    // Nessun separatore: la spaziatura è via flex gap.
    function creditPill(name, value, color) {
      return '<span class="credit-service">' +
        '<span class="status-dot" style="background:' + color + '"></span>' +
        esc(name) + (value ? ' ' + esc(value) : '') +
        '</span>';
    }

    export function renderCredits(badge, data) {
      if (!badge) return;
      rememberTs(badge, data && data._ts);

      if (!data || !data.services) {
        badge.innerHTML = '';
        badge.style.display = 'none';
        return;
      }
      badge.style.display = '';
      badge.classList.remove('warning'); // reset: il toggle sotto scatta solo nel ramo ok

      const services = data.services;
      const parts = [];

      // Tavily
      const tavily = services.tavily || {};
      if (tavily.status === 'ok' && tavily.percentage !== null && tavily.percentage !== undefined) {
        const pct = tavily.percentage;
        let color;
        if (pct < 60)      color = '#3fb950';
        else if (pct < 80) color = '#d29922';
        else if (pct < 95) color = '#f0883e';
        else               color = '#f85149';
        parts.push(creditPill('Tavily', pct + '%', color));
        badge.classList.toggle('warning', pct > 80);
      } else if (tavily.status === 'unconfigured') {
        parts.push(creditPill('Tavily', '—', '#484f58'));
      } else {
        parts.push(creditPill('Tavily', 'err', '#484f58'));
      }

      // Exa
      const exa = services.exa || {};
      if (exa.status === 'ok') {
        parts.push(creditPill('Exa', '', '#3fb950'));
      } else {
        parts.push(creditPill('Exa', '', '#484f58'));
      }

      badge.innerHTML = parts.join('') +
        (data._ts ? staleBadgeHTML(data._ts) : '');
    }

    // -- OpenCode Usage compatto (pill nella barra controlli) --
    const USAGE_SHORT = { '5-hour Usage': '5h', 'Rolling Usage': 'roll', 'Weekly Usage': 'sett', 'Monthly Usage': 'mese' };
    const WINDOW_ORDER = ['5-hour Usage', 'Rolling Usage', 'Weekly Usage', 'Monthly Usage'];

    function usageColor(pct) {
      if (pct >= 95) return '#f85149';
      if (pct >= 80) return '#f0883e';
      if (pct >= 60) return '#d29922';
      return '#3fb950';
    }

    export function renderUsageCompact(badge, data) {
      if (!badge) return;
      rememberTs(badge, data && data._ts);
      if (!data || !data.accounts || !data.accounts.length) {
        badge.style.display = 'none';
        badge.innerHTML = '';
        return;
      }
      badge.style.display = '';
      const multi = data.accounts.length > 1;
      const parts = ['<i class="fa-solid fa-bolt" style="color:#79c0ff;font-size:11px;"></i>'];
      data.accounts.forEach(acc => {
        const windows = acc.windows || {};
        if (multi) parts.push('<span style="color:#484f58;font-size:11px;">' + esc(acc.name) + '</span>');
        WINDOW_ORDER.forEach(key => {
          const w = windows[key];
          if (!w) return;
          const pct = Math.round(w.pct || 0);
          const label = USAGE_SHORT[key] || key;
          const reset = w.resets_short ? '<span style="color:#484f58;">↺' + esc(w.resets_short) + '</span>' : '';
          parts.push('<span class="credit-service" title="' + esc(key + ' - ' + acc.name + ' - ' + (w.resets_in || '')) + '">' +
            '<span class="status-dot" style="background:' + usageColor(pct) + '"></span>' +
            esc(label) + ' ' + pct + '%' + reset +
            '</span>');
        });
      });
      badge.innerHTML = parts.join('') + (data._ts ? staleBadgeHTML(data._ts) : '');
    }

    export function renderUsageCompactSkeleton(badge) {
      if (!badge) return;
      badge.style.display = '';
      badge.innerHTML = '<span class="credit-service"><span class="status-dot" style="background:#484f58"></span>usage ...</span>';
    }

    export function renderUsageCompactError(badge, message) {
      if (!badge) return;
      if (badge.dataset.ts) {
        markStale(badge);
        return;
      }
      badge.style.display = '';
      badge.innerHTML =
        '<span class="credit-service"><span class="status-dot" style="background:#484f58"></span>usage n/d</span>' +
        '<button class="retry-btn" data-retry="slow" title="' + esc(message) + '"><i class="fas fa-rotate-right"></i></button>';
    }
