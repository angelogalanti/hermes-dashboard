    // ── widgets.js — credits badge, AI quote ───────────────────
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

    // -- AI quote (pannello: 5h/weekly per provider, da /api/ai-quota) --
    // Barra = consumo; tacca = quota di tempo già trascorsa nella finestra.
    // Barra oltre la tacca → a questo ritmo la quota finisce prima del reset.
    const QUOTA_OK = '#3fb950', QUOTA_WARN = '#d29922', QUOTA_CRIT = '#f85149';
    const PACE_WARN = 115; // % proiettato a fine finestra oltre cui avvisare

    // ponytail: durata dedotta dal nome finestra; 'monthly' ≈ 30g (i mesi variano di ±1g)
    function windowSecs(name) {
      if (/5h/.test(name)) return 5 * 3600;
      if (/week/.test(name)) return 7 * 86400;
      if (/month/.test(name)) return 30 * 86400;
      return null;
    }

    function fmtDur(s) {
      s = Math.max(0, s);
      const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
      return d ? d + 'g ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm';
    }

    // { elapsed: 0..1 | null, left: secondi al reset | null, exhaustIn: secondi | null, level }
    export function quotaPace(pct, resetsAt, name, now = Date.now() / 1000) {
      const win = windowSecs(name);
      const left = resetsAt ? Math.max(0, resetsAt - now) : null;
      const elapsed = win && left != null ? Math.min(1, Math.max(0, 1 - left / win)) : null;
      let exhaustIn = null;
      // stima del ritmo solo dopo il 10% della finestra (prima è rumore) e avviso solo se la
      // proiezione a fine finestra supera il 115%: uno scarto di 1-2 punti è "in linea", non un allarme
      if (elapsed != null && elapsed >= 0.1 && pct > 0 && pct < 100 && pct / elapsed > PACE_WARN) {
        exhaustIn = (100 - pct) / (pct / (elapsed * win)); // secondi a 100% al ritmo medio attuale
      }
      const level = pct >= 95 ? 'crit' : exhaustIn != null ? 'warn' : 'ok';
      return { elapsed, left, exhaustIn, level };
    }

    function quotaRowHTML(w, stale) {
      const pc = quotaPace(w.pct, w.resets_at, w.name);
      // reset già passato ma dato nuovo non ancora arrivato (cache backend ≤5min): niente % vecchia
      if (pc.left === 0) {
        return '<div class="quota-row muted" title="' + esc(w.name + ': ultimo dato ' + w.pct + '% prima del reset') + '">' +
          '<span>' + esc(w.name) + '</span><div class="quota-bar"></div><span class="quota-pct">—</span>' +
          '<span class="quota-reset">reset avvenuto</span>' +
          (stale ? '' : '<span class="quota-note">in aggiornamento…</span>') + '</div>';
      }
      const color = { ok: QUOTA_OK, warn: QUOTA_WARN, crit: QUOTA_CRIT }[pc.level];
      const tip = w.name + ': ' + w.pct + '% usato' +
        (pc.elapsed != null ? ' · ' + Math.round(pc.elapsed * 100) + '% del tempo trascorso' : '') +
        (w.resets_at ? ' · reset ' + new Date(w.resets_at * 1000).toLocaleString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '');
      const icon = pc.level === 'ok' ? '' : '<i class="fas fa-triangle-exclamation" style="color:' + color + '" aria-hidden="true"></i> ';
      const note = pc.level === 'crit' ? 'quota quasi esaurita'
        : pc.exhaustIn != null ? 'a questo ritmo finisce tra ~' + fmtDur(pc.exhaustIn) + ', prima del reset' : '';
      return '<div class="quota-row" title="' + esc(tip) + '"><span>' + esc(w.name) + '</span>' +
        '<div class="quota-bar"><div class="quota-fill" style="width:' + Math.min(w.pct, 100) + '%;background:' + color + '"></div>' +
        (pc.elapsed != null ? '<div class="quota-tick" style="left:' + (pc.elapsed * 100).toFixed(1) + '%"></div>' : '') + '</div>' +
        '<span class="quota-pct">' + icon + w.pct + '%</span>' +
        '<span class="quota-reset">' + (pc.left != null ? '↺ ' + fmtDur(pc.left) : '') + '</span>' +
        (note ? '<span class="quota-note" style="color:' + color + '">' + esc(note) + '</span>' : '') + '</div>';
    }

    // Ultimo payload: il countdown e la tacca si aggiornano in locale ogni 30s, senza fetch
    let _quotaLast = null, _quotaTimer = null;

    export function renderAiQuota(container, data) {
      if (!container) return;
      _quotaLast = { container, data };
      if (!_quotaTimer) _quotaTimer = setInterval(() => {
        if (!document.hidden && _quotaLast) renderAiQuota(_quotaLast.container, _quotaLast.data);
      }, 30000);
      const alerts = data.alerts || {};
      container.innerHTML = (data.providers || []).map(p => {
        const al = alerts[p.provider];
        const alertBadge = (al && al.armed)
          ? ' <span class="stale-badge" title="Alert refill 5h armato (era al ' + al.peak_pct + '%): notifica attiva al reset"><i class="fas fa-bell"></i> refill armato</span>'
          : '';
        const head = '<div class="quota-provider">' + esc(p.provider) + alertBadge +
          (p.plan ? ' <span class="quota-plan">' + esc(p.plan) + '</span>' : '') +
          (p.at ? ' ' + staleBadgeHTML(p.at).replace('stale-badge', 'stale-badge' + (p.stale ? ' warn' : '')) : '') +
          (p.stale ? ' <span class="stale-badge warn">· ' + esc(p.stale) + '</span>' : '') + '</div>';
        const rows = p.ok
          ? (p.windows || []).map(w => quotaRowHTML(w, p.stale)).join('') || '<div class="quota-msg">nessuna finestra</div>'
          : '<div class="quota-msg quota-err">n/d — ' + esc(p.error) + '</div>';
        return '<div class="quota-card">' + head + rows + '</div>';
      }).join('');
    }

    export function renderAiQuotaError(container, message) {
      if (!container) return;
      container.innerHTML = '<div class="quota-err">quote non disponibili — ' + esc(message) +
        ' <button class="retry-btn" data-retry="slow"><i class="fas fa-rotate-right"></i></button></div>';
    }
