(function () {
  const resource = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'pulsemdt';
  const $ = (id) => document.getElementById(id);
  const GLYPH = {
    off_duty: '○', available: '●', dispatched: '◆', enroute: '▶', onscene: '■',
    transporting: '»', at_destination: '▣', busy: '◐', out_of_service: '⊘', emergency: '▲',
  };
  const BARS = { 1: '▮▮▮', 2: '▮▮▯', 3: '▮▯▯' };
  const ICONS = {
    cad: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    name: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plate: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    returns: '<path d="M8 4h11v16H8z"/><path d="M5 7v13h11"/><path d="M11 9h5M11 13h5"/>',
    mycall: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    call: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    panic: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14M12 3v2M4.2 7.2l1.4 1.4M19.8 7.2l-1.4 1.4"/>',
  };
  let state = null;
  let clockTimer = null;
  let view = 'cad';
  let queryKind = 'plate';
  let lastReturn = null;
  const history = [];

  function post(name, data) {
    return fetch('https://' + resource + '/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(data || {}),
    }).catch(function () { return null; });
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === 'text') node.textContent = props[key];
        else if (key === 'class') node.className = props[key];
        else if (key === 'html') node.innerHTML = props[key];
        else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), props[key]);
        else node.setAttribute(key, props[key]);
      });
    }
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function shortNumber(n) { return '#' + String(n).padStart(4, '0'); }
  function elapsed(iso) {
    const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const mm = String(m).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function agencyOf(unit) {
    const list = (state && state.profile && state.profile.agencies) || [];
    return unit ? list.find(function (a) { return a.id === unit.agencyId; }) : null;
  }

  function seat() {
    const unit = state && state.unit;
    const agency = agencyOf(unit);
    if (!unit) return 'civilian';
    if (agency && (agency.discipline === 'fire' || agency.discipline === 'ems')) return agency.discipline;
    return 'law';
  }

  function tile(id, label, icon, opts) {
    const o = opts || {};
    const btn = el('button', {
      type: 'button',
      class: 'tile' + (o.danger ? ' danger' : '') + (o.on ? ' on' : ''),
      'aria-pressed': String(Boolean(o.active)),
      title: o.title || label,
      onclick: o.onclick,
      html: '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[icon] + '</svg>',
    });
    btn.appendChild(el('span', { text: label }));
    if (o.badge) btn.appendChild(el('span', { class: 'badge', text: String(o.badge) }));
    if (o.disabled) btn.disabled = true;
    btn.id = 'tile-' + id;
    return btn;
  }

  function setView(next) {
    view = next;
    render();
    if (next === 'query') setTimeout(function () { $('query-text').focus(); }, 0);
    if (next === '911') setTimeout(function () { $('call-text').focus(); }, 0);
  }

  function chooseKind(kind) {
    queryKind = kind;
    document.querySelectorAll('.seg-btn').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.kind === kind));
    });
    $('query-text').placeholder = kind === 'plate' ? 'Plate' : 'Last, first';
  }

  function renderChrome() {
    const unit = state && state.unit;
    const s = seat();
    $('tablet').setAttribute('data-seat', s);
    const incident = state && state.incident;
    $('title').textContent = view === 'query'
      ? 'Returns'
      : view === '911'
        ? 'Call 911'
        : incident
          ? shortNumber(incident.shortNumber) + ' - ' + incident.natureName
          : s === 'fire' ? 'Fire MDT' : s === 'ems' ? 'EMS MDT' : unit ? 'MDT' : 'PulseMDT';
    const online = state && state.online !== false && state.configured;
    const link = $('link');
    link.textContent = online ? '● Live' : '◐ CAD unreachable';
    link.classList.toggle('off', !online);

    const tiles = $('tiles');
    tiles.textContent = '';
    const canQuery = Boolean(state && state.member && unit);
    tiles.appendChild(tile('cad', 'CAD', 'cad', { active: view === 'cad', onclick: function () { setView('cad'); } }));
    tiles.appendChild(tile('name', 'Name check', 'name', {
      disabled: !canQuery,
      onclick: function () { chooseKind('person'); setView('query'); },
    }));
    tiles.appendChild(tile('plate', 'Plate', 'plate', {
      disabled: !canQuery,
      onclick: function () { chooseKind('plate'); setView('query'); },
    }));
    tiles.appendChild(tile('returns', 'Returns', 'returns', {
      active: view === 'query',
      badge: history.length || null,
      disabled: !canQuery,
      onclick: function () { setView('query'); },
    }));
    tiles.appendChild(tile('mycall', 'My call', 'mycall', {
      active: view === 'cad' && Boolean(incident),
      disabled: !incident,
      onclick: function () { setView('cad'); },
    }));
    tiles.appendChild(tile('call', 'Call 911', 'call', { active: view === '911', onclick: function () { setView('911'); } }));
    if (unit) {
      tiles.appendChild(tile('panic', unit.emergency ? 'Clear' : 'Panic', 'panic', {
        danger: true,
        on: unit.emergency,
        title: unit.emergency ? 'Clear your emergency' : 'Emergency button',
        onclick: function () { post('panic'); },
      }));
    }

    const agency = agencyOf(unit);
    const patch = $('patch');
    patch.hidden = !agency;
    patch.textContent = agency ? agency.code : '';

    $('sb-unit').textContent = unit
      ? unit.callsign + ' ' + unit.statusCode + ' ' + (unit.statusLabel || '') + '  ' + elapsed(unit.statusSince)
      : 'Not signed on';
    $('sb-name').textContent = state && state.profile ? state.profile.displayName : '';
    const pending = (state && state.pending) || [];
    $('sb-counts').textContent = pending.length + ' waiting';
  }

  function renderBanner() {
    const banner = $('banner');
    banner.className = 'banner';
    let text = '';
    if (!state) text = 'Connecting to the CAD...';
    else if (!state.linked) text = 'Open Discord before starting FiveM so PulseMDT can recognize you.';
    else if (!state.configured) text = 'This server is not connected to the CAD yet.';
    else if (!state.member) text = 'You are not a member of this community yet. Sign in on the community website with the same Discord account.';
    else if (state.unit && state.unit.emergency) {
      text = 'EMERGENCY ACTIVE: every unit has your location.';
      banner.classList.add('emergency');
    }
    banner.textContent = text;
    banner.hidden = !text;
  }

  function renderUnit() {
    const unit = state && state.unit;
    const agencies = (state && state.profile && state.profile.agencies) || [];
    const canSignOn = Boolean(state && state.member && agencies.length > 0);
    $('view-unit').hidden = view !== 'cad';
    $('signon').hidden = Boolean(unit) || !canSignOn;
    $('myunit').hidden = !unit;
    $('offduty').hidden = Boolean(unit) || canSignOn;
    $('offduty-text').textContent = state && state.member
      ? 'Your roles do not include a department. Civilians can still call 911.'
      : 'Join the community on its website to go on duty.';
    const select = $('agency');
    if (select.options.length !== agencies.length) {
      select.textContent = '';
      agencies.forEach(function (a) {
        select.appendChild(el('option', { value: a.id, text: a.code + '  ' + a.name }));
      });
    }
    const chosen = agencies.find(function (a) { return a.id === select.value; }) || agencies[0];
    if (chosen && chosen.callsign && !$('callsign').value) $('callsign').placeholder = chosen.callsign;
    if (!unit) return;
    $('my-callsign').textContent = unit.callsign;
    const grid = $('statuses');
    grid.textContent = '';
    (state.statuses || []).forEach(function (s, i) {
      grid.appendChild(el('button', {
        type: 'button',
        class: 'status',
        'aria-pressed': String(s.code === unit.statusCode),
        onclick: function () { post('status', { code: s.code }); },
      }, [
        i < 9 ? el('span', { class: 'key', text: 'F' + (i + 1) }) : null,
        el('span', { class: 'code c-' + s.category, text: (GLYPH[s.category] || '') + ' ' + s.code }),
        el('span', { class: 'label', text: s.label }),
      ]));
    });
  }

  function renderCalls() {
    const body = $('pending');
    body.textContent = '';
    const pending = (state && state.pending) || [];
    const incident = state && state.incident;
    const rows = incident ? [incident].concat(pending.filter(function (p) { return p.id !== incident.id; })) : pending;
    $('pending-count').textContent = pending.length + ' waiting';
    if (rows.length === 0) {
      body.appendChild(el('tr', { class: 'empty' }, [el('td', { colspan: '6', text: 'No calls waiting.' })]));
    }
    const canTake = Boolean(state && state.unit && !state.unit.incidentId);
    rows.forEach(function (i) {
      const mine = incident && i.id === incident.id;
      body.appendChild(el('tr', { class: 'p' + Math.min(i.priority, 3) + (mine ? ' mine' : '') }, [
        el('td', { text: shortNumber(i.shortNumber) }),
        el('td', { text: 'P' + i.priority }),
        el('td', { text: i.natureName }),
        el('td', { class: 'where', text: i.location.address + (i.location.postal ? ' (' + i.location.postal + ')' : '') }),
        el('td', { text: elapsed(i.openedAt) }),
        el('td', null, [
          mine
            ? el('span', { text: 'MINE' })
            : canTake
              ? el('button', {
                  type: 'button',
                  class: 'take',
                  text: 'Take',
                  onclick: function () { post('attach', { incidentId: i.id }); },
                })
              : null,
        ]),
      ]));
    });
    renderIncident();
  }

  function renderIncident() {
    const box = $('incident');
    const incident = state && state.incident;
    box.hidden = !incident;
    box.textContent = '';
    if (!incident) return;
    box.appendChild(el('h3', null, [
      el('span', { class: 'prio p' + Math.min(incident.priority, 4), text: (BARS[incident.priority] || '▯▯▯') + 'P' + incident.priority }),
      el('span', { text: incident.natureName }),
      el('span', { class: 'num', text: shortNumber(incident.shortNumber) + '  ' + (incident.number || '') }),
    ]));
    box.appendChild(el('p', {
      class: 'addr',
      text: incident.location.address + (incident.location.postal ? '  POSTAL ' + incident.location.postal : ''),
    }));
    const actions = el('div', { class: 'actions' });
    if (typeof incident.location.x === 'number' && typeof incident.location.y === 'number') {
      actions.appendChild(el('button', {
        type: 'button',
        class: 'secondary',
        text: 'Set waypoint',
        onclick: function () { post('waypoint', { x: incident.location.x, y: incident.location.y }); },
      }));
    }
    box.appendChild(actions);
    const input = el('input', { maxlength: '500', placeholder: 'Add a note for dispatch', autocomplete: 'off' });
    box.appendChild(el('form', {
      onsubmit: function (event) {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        post('note', { incidentId: incident.id, text: text });
        input.value = '';
      },
    }, [input, el('button', { type: 'submit', class: 'secondary', text: 'Add note' })]));
  }

  const FLAG_GLYPH = { danger: '▲', warning: '◆', info: '●' };
  function flagList(flags) {
    const list = el('ul', { class: 'flags' });
    if (!flags || flags.length === 0) {
      list.appendChild(el('li', { class: 'clear', text: '● No warrants, cautions, BOLOs or stolen reports on file.' }));
      return list;
    }
    flags.forEach(function (f) {
      list.appendChild(el('li', { class: f.level }, [
        el('span', { class: 'code', text: (FLAG_GLYPH[f.level] || '') + ' ' + f.code }),
        el('span', { text: f.text }),
      ]));
    });
    return list;
  }

  function labelOf(ret) {
    return ret.kind === 'plate' ? 'PLATE ' + ret.plate.query : 'NAME ' + ret.person.query;
  }

  function renderReturn() {
    const box = $('return');
    box.textContent = '';
    $('view-query').hidden = (view !== 'query' && view !== 'cad') || !(state && state.unit);
    if (!lastReturn) {
      box.hidden = true;
    } else {
      box.hidden = false;
      const ret = lastReturn;
      if (ret.kind === 'plate') {
        const p = ret.plate;
        box.appendChild(el('div', { class: 'head' }, [el('strong', { text: 'Plate ' + p.query })]));
        box.appendChild(flagList(p.flags));
        if (p.matches.length === 0) box.appendChild(el('p', { class: 'dim', text: 'No vehicle on file.' }));
        p.matches.slice(0, 3).forEach(function (m) {
          const v = m.vehicle;
          const desc = [v.year, v.color, v.make, v.model].filter(Boolean).join(' ');
          const owner = m.owner ? m.owner.lastName + ', ' + m.owner.firstName + (m.owner.dob ? '  DOB ' + m.owner.dob : '') : 'NOT ON FILE';
          box.appendChild(el('p', { class: 'rec', text: (m.possible ? 'POSSIBLE  ' : '') + v.plate + '  ' + desc }));
          box.appendChild(el('p', { class: 'dim', text: 'Owner ' + owner + '. Registration ' + v.registrationStatus + ', insurance ' + v.insuranceStatus + '.' }));
        });
      } else if (ret.kind === 'person') {
        const r = ret.person;
        box.appendChild(el('div', { class: 'head' }, [
          el('strong', { text: 'Name ' + r.query }),
          el('span', { class: 'dim', text: r.results.length + ' found' }),
        ]));
        if (r.results.length === 0) box.appendChild(el('p', { class: 'dim', text: 'No record found. Spelling is forgiven, try fewer letters.' }));
        r.results.slice(0, 4).forEach(function (p) {
          box.appendChild(el('p', { class: 'rec', text: p.lastName + ', ' + p.firstName + (p.dob ? '  DOB ' + p.dob : '') }));
          box.appendChild(flagList(p.flags));
        });
      }
    }
    const list = $('history');
    list.textContent = '';
    list.hidden = view !== 'query' || history.length === 0;
    history.forEach(function (h) {
      list.appendChild(el('li', null, [el('button', {
        type: 'button',
        onclick: function () { lastReturn = h.ret; renderReturn(); },
      }, [el('span', { class: 't', text: h.at }), el('span', { text: labelOf(h.ret) })])]));
    });
  }

  function render() {
    renderChrome();
    renderBanner();
    renderUnit();
    renderCalls();
    renderReturn();
    $('view-911').hidden = view !== '911';
  }

  function addNotice(notice) {
    const list = $('notices');
    const item = el('li', { class: notice.kind || 'info', text: (notice.title ? notice.title + ': ' : '') + (notice.text || '') });
    list.insertBefore(item, list.firstChild);
    while (list.children.length > 4) list.removeChild(list.lastChild);
    setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 12000);
  }

  function tick() {
    const now = new Date();
    $('clock').textContent = now.toTimeString().slice(0, 8);
    $('date').textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    if (state && state.unit) $('sb-unit').textContent = state.unit.callsign + ' ' + state.unit.statusCode + ' ' + (state.unit.statusLabel || '') + '  ' + elapsed(state.unit.statusSince);
  }

  function open(next) {
    if (next) state = next;
    $('tablet').hidden = false;
    render();
    tick();
    if (!clockTimer) clockTimer = setInterval(tick, 1000);
  }

  function close() {
    $('tablet').hidden = true;
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  }

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.type === 'open') open(msg.state);
    else if (msg.type === 'close') close();
    else if (msg.type === 'state') { state = msg.state; if (!$('tablet').hidden) render(); }
    else if (msg.type === 'online') { if (state) state.online = msg.online; if (!$('tablet').hidden) renderChrome(); }
    else if (msg.type === 'notice' && msg.notice) addNotice(msg.notice);
    else if (msg.type === 'radio') {
      const radio = $('sb-radio');
      radio.hidden = false;
      radio.textContent = msg.channel > 0 ? 'RADIO CH ' + msg.channel : 'RADIO OFF';
    }
    else if (msg.type === 'return') {
      lastReturn = msg.ret || null;
      if (lastReturn) {
        history.unshift({ at: new Date().toTimeString().slice(0, 5), ret: lastReturn });
        if (history.length > 15) history.pop();
      }
      view = 'query';
      render();
    }
  });

  document.addEventListener('keydown', function (event) {
    if ($('tablet').hidden) return;
    if (event.key === 'Escape') {
      post('close');
      return;
    }
    const match = /^F([1-9])$/.exec(event.key);
    if (match && state && state.unit) {
      const s = (state.statuses || [])[Number(match[1]) - 1];
      if (s) {
        event.preventDefault();
        if (s.code !== state.unit.statusCode) post('status', { code: s.code });
      }
    }
  });

  $('close').addEventListener('click', function () { post('close'); });
  $('signoff').addEventListener('click', function () { post('signOff'); });
  $('agency').addEventListener('change', function () { $('callsign').placeholder = ''; renderUnit(); });
  document.querySelectorAll('.seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { chooseKind(b.dataset.kind); $('query-text').focus(); });
  });
  $('signon-form').addEventListener('submit', function (event) {
    event.preventDefault();
    post('signOn', {
      agencyId: $('agency').value,
      callsign: $('callsign').value.trim().toUpperCase(),
      vehicle: $('vehicle').value.trim(),
    });
  });
  $('query-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const text = $('query-text').value.trim();
    if (!text) return;
    post('query', { kind: queryKind, text: text });
  });
  $('call-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const text = $('call-text').value.trim();
    if (!text) return;
    post('call911', { message: text });
    $('call-text').value = '';
    setView('cad');
  });
})();
