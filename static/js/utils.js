    // ── utils.js — helper condivisi (no dipendenze) ──────────────

    // Escape HTML per i template string. Tutto il testo proveniente da
    // API/disco passa da qui prima di finire in innerHTML.
    export function esc(s) {
      const div = document.createElement('div');
      div.textContent = s == null ? '' : String(s);
      return div.innerHTML;
    }

    // Abbrevia un task id per le card kanban
    export function shortId(id) {
      if (!id) return '\u2014';
      return id.length > 10 ? id.slice(0, 10) + '\u2026' : id;
    }

    // "3m", "2h", "5g" — per last-used / heartbeat
    export function timeAgo(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const now = new Date();
      const diff = Math.floor((now - d) / 1000);
      if (diff < 60) return 'ora';
      if (diff < 3600) return Math.floor(diff / 60) + 'm';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      return Math.floor(diff / 86400) + 'g';
    }

    // "aggiornato 3 min fa" — per i badge di freschezza dati.
    // ts è un timestamp unix in secondi (campo `_ts` delle API).
    export function fmtAge(ts) {
      if (!ts) return '';
      const diff = Math.floor(Date.now() / 1000 - ts);
      if (diff < 60) return 'aggiornato ora';
      if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return 'aggiornato ' + m + ' min fa';
      }
      if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return 'aggiornato ' + h + ' h fa';
      }
      const g = Math.floor(diff / 86400);
      return 'aggiornato ' + g + ' g fa';
    }

    // ── Sort profili: default → ceo → gateway running → altri ──
    export function sortProfiles(profiles) {
      return [...profiles].sort((a, b) => {
        if (a.name === 'default') return -1;
        if (b.name === 'default') return 1;
        if (a.name === 'ceo') return -1;
        if (b.name === 'ceo') return 1;
        const aGw = a.gateway === 'running';
        const bGw = b.gateway === 'running';
        if (aGw && !bGw) return -1;
        if (!aGw && bGw) return 1;
        return a.name.localeCompare(b.name);
      });
    }
