/* Salus H4 — Heat, sun and air quality. The ONLY networked feature in Salus: opt-in calls to Open-Meteo (no key).
 * Hosts used: geocoding-api.open-meteo.com, api.open-meteo.com, air-quality-api.open-meteo.com. */
(function () {
  'use strict';
  var h = MT.h, L = (self.MTLib || {}).passport;
  if (!L) { console.error('Environment needs MTLib.passport'); return; }
  var K_SET = 'health.environment.settings', K_CACHE = 'health.environment.cache', K_MAN = 'health.environment.manual';
  var HOSTS = { geo: 'https://geocoding-api.open-meteo.com/v1/search', fc: 'https://api.open-meteo.com/v1/forecast', aq: 'https://air-quality-api.open-meteo.com/v1/air-quality' };

  MT.css('env', [
    '.env-grid{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr))}',
    '.env-stat{border:1px solid var(--border);background:var(--surface-2);border-radius:var(--radius-sm);padding:.55rem .7rem}',
    '.env-stat .v{font-size:1.45rem;font-weight:800;line-height:1.1}.env-stat .l{font-size:.78rem;color:var(--muted)}',
    '.env-results{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}',
    '.env-results button{width:100%;text-align:left}',
    '.env-send{font-family:var(--mono);font-size:.82rem;word-break:break-all;background:var(--surface-2);border:1px solid var(--border);padding:.5rem;border-radius:var(--radius-sm)}',
    '.env-advice{margin:.3rem 0 0 1.1rem;padding:0}.env-advice li{margin:.25rem 0}'
  ].join('\n'));

  function settings() { var s = MT.store.get(K_SET, {}) || {}; return typeof s === 'object' ? s : {}; }
  function setSettings(patch) { var s = Object.assign(settings(), patch); MT.store.set(K_SET, s); return s; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function f1(x) { return MT.fmt(x, 0); }
  function both(c) { return f1(c) + ' °C (' + f1(L.cToF(c)) + ' °F)'; }

  /* ------------------------------------------------------------ network */
  function getJson(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, credentials: 'omit', referrerPolicy: 'no-referrer' }).then(function (r) {
      clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : undefined; }
  /** Fetch forecast + air quality; resolves a cache object. Coordinates are already rounded to 2 dp. */
  function fetchAll(loc) {
    var q = '?latitude=' + loc.lat + '&longitude=' + loc.lon;
    var fcUrl = HOSTS.fc + q + '&current=temperature_2m,relative_humidity_2m,apparent_temperature&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,uv_index_max&timezone=auto&forecast_days=2';
    var aqUrl = HOSTS.aq + q + '&current=pm2_5,pm10,ozone,nitrogen_dioxide,us_aqi,uv_index&hourly=pm2_5,us_aqi&forecast_hours=24&timezone=auto';
    return Promise.all([getJson(fcUrl), getJson(aqUrl).catch(function (e) { return { _err: e }; })]).then(function (r) {
      var f = r[0], a = r[1], c = f && f.current, dly = f && f.daily;
      if (!c || num(c.temperature_2m) == null) throw new Error('No weather data');
      var out = { t: Date.now(), loc: loc, current: { tempC: c.temperature_2m, rh: num(c.relative_humidity_2m) != null ? c.relative_humidity_2m : 50, apparentC: num(c.apparent_temperature) },
        daily: dly ? { maxC: num(dly.temperature_2m_max && dly.temperature_2m_max[0]), minC: num(dly.temperature_2m_min && dly.temperature_2m_min[0]), apparentMaxC: num(dly.apparent_temperature_max && dly.apparent_temperature_max[0]), uvMax: num(dly.uv_index_max && dly.uv_index_max[0]) } : {}, air: null };
      if (a && !a._err && a.current) {
        var ac = a.current, hp = (a.hourly && a.hourly.pm2_5 || []).filter(num), ha = (a.hourly && a.hourly.us_aqi || []).filter(num);
        out.air = { pm25: num(ac.pm2_5), pm10: num(ac.pm10), o3: num(ac.ozone), no2: num(ac.nitrogen_dioxide), aqi: num(ac.us_aqi), uv: num(ac.uv_index), pm25Mean24: hp.length ? hp.reduce(function (s, x) { return s + x; }, 0) / hp.length : undefined, aqiMax24: ha.length ? Math.max.apply(null, ha) : undefined };
      }
      return out;
    });
  }

  /* ------------------------------------------------------------ advice */
  var HEAT_ADVICE = {
    0: ['No special heat risk now. Drink water when you are thirsty.'],
    1: ['Drink water often, before you feel thirsty.', 'Take breaks in the shade when you work or play outside.', 'Wear light, loose clothes.'],
    2: ['Drink water often. If a doctor limits your fluids, ask how much is safe in the heat.', 'Avoid hard work or sport outside in the hottest hours (about 11 am to 4 pm).', 'Rest in the shade or a cool room. Wet your skin or clothes to cool down.', 'Check on older neighbours, babies and anyone who lives alone.'],
    3: ['Stay in the coolest place you can, out of the sun. A fan helps only if the air is not extremely hot; wet skin and a fan cool you better.', 'Do not do hard work outside. Rest often.', 'Drink water often. If a doctor limits your fluids, ask how much is safe.', 'Never leave a child, older person or pet in a parked car.', 'Look for signs of heat stroke: hot skin, confusion, fainting, a temperature over 40 °C. This is an emergency.'],
    4: ['This is dangerous heat. Stay indoors in the coolest place, or go to a cool public building.', 'Do not go out unless you must. Rest and keep wet and cool.', 'Check on people at risk several times a day.', 'Know the signs of heat stroke (hot skin, confusion, fainting). Call for help at once.']
  };
  function uvAdvice(uv) {
    var a = [];
    if (uv >= 3) { a.push('Wear a hat and sunglasses, and cover your arms and legs.'); a.push('Use sunscreen SPF 30 or higher on skin that is not covered. Put it on again every 2 hours and after swimming.'); a.push('Stay in the shade around midday (about 10 am to 4 pm). Keep babies under 6 months out of direct sun.'); }
    if (uv >= 8) a.push('The UV is very strong. Skin can burn in under 15 minutes. Try to avoid being outside at midday.');
    return a;
  }
  function airAdvice(air, vulnerable) {
    var a = [], aqi = air.aqi, pm = air.pm25;
    if (aqi != null && aqi > 100 || (pm != null && pm > L.WHO_AQG.pm25.h24)) {
      a.push('People with asthma, lung or heart disease, older adults, pregnant women and children should do less hard exercise outside.');
      a.push('Keep windows closed on the worst days. A well-fitted mask (N95, FFP2 or KN95) helps outdoors; a cloth mask does not stop fine smoke.');
    }
    if (aqi != null && aqi > 150) { a.push('Everyone should cut down on hard activity outside. Use your reliever inhaler as your doctor told you if you have asthma.'); a.push('Use a clean-air room if you can: windows closed, no smoking or burning indoors.'); }
    if (aqi != null && aqi > 200) a.push('Stay indoors as much as you can. See a health worker if you have chest pain, trouble breathing or a bad cough.');
    if (!a.length) a.push('Air quality is fine for normal outdoor activity.');
    if (vulnerable && (aqi > 50 || pm > L.WHO_AQG.pm25.annual)) a.push('You have a health condition that can make air pollution worse. Take extra care on days when the air is poor.');
    return a;
  }

  /* ------------------------------------------------------------ view */
  function vulnerabilityNow() {
    var profile = MT.profile.get();
    return L.vulnerabilityFrom(profile, MT.store.get('health.coach.meds', null), MT.today());
  }
  function advList(arr) { return h('ul.env-advice', arr.map(function (x) { return h('li', MT.t(x)); })); }
  function renderHeat(host, data, vul, source) {
    var risk = L.heatRisk(data, vul.length > 0), cat = risk.type;
    var stats = h('div.env-grid',
      h('div.env-stat', h('div.v', f1(data.tempC) + ' °C'), h('div.l', MT.t('Air temperature') + ' · ' + f1(L.cToF(data.tempC)) + ' °F')),
      h('div.env-stat', h('div.v', f1(data.rh) + '%'), h('div.l', MT.t('Humidity'))),
      h('div.env-stat', h('div.v', f1(risk.feelsC) + ' °C'), h('div.l', MT.t('Feels like') + ' · ' + f1(L.cToF(risk.feelsC)) + ' °F')),
      h('div.env-stat', h('div.v', MT.fmt(risk.wetBulbC, 1) + ' °C'), h('div.l', MT.t('Wet-bulb temperature'))));
    host.appendChild(h('div.result.band-' + (cat === 'info' ? 'info' : cat), { 'aria-live': 'polite' },
      h('div.result-label', MT.t('Heat risk')), h('div.result-title', MT.t(risk.label)),
      risk.raised ? h('p', { style: 'margin:.2rem 0' }, MT.t('Raised one level because of your health factors.')) : null));
    host.appendChild(stats);
    if (vul.length) host.appendChild(h('p.small', h('strong', MT.t('Your extra heat risks') + ': '), vul.map(function (v) { return MT.t(v.label); }).join('; '), '. ', MT.t('Heat harms you at lower temperatures than most people. Take the advice for a higher level.')));
    host.appendChild(h('div', h('h3', MT.t('What to do')), advList(HEAT_ADVICE[risk.level])));
    if (vul.some(function (v) { return /^med-/.test(v.id); })) host.appendChild(MT.ui.alert('info', MT.t('Your medicines'), MT.t('Some medicines make it harder to stay cool or can dry you out. Do not stop them on your own. Ask your pharmacist or doctor what to do in very hot weather.')));
    host.appendChild(h('p', h('a.btn.btn-sm' + (risk.level >= 3 ? '.btn-danger' : ''), { href: '#/first-aid/heat-stroke' }, '🔥 ' + MT.t('Heat stroke: what to do'))));
    host.appendChild(h('p.small.muted', MT.t('How it is worked out: "feels like" is the NOAA heat index (Rothfusz) or the weather service value, whichever is higher. Wet-bulb uses the Stull (2011) formula. Bands follow the US National Weather Service heat categories, moved up one level for people at higher risk.')));
    return risk;
  }
  function renderUv(host, uv) {
    var cat = L.uvCategory(uv);
    host.appendChild(h('div.result.band-' + (cat.type === 'info' ? 'info' : cat.type), h('div.result-label', MT.t('UV index (highest today)')), h('div.result-value', MT.fmt(uv, 1, { trim: true })), h('div.result-title', MT.t(cat.label))));
    var a = uvAdvice(uv);
    host.appendChild(a.length ? h('div', h('h3', MT.t('Protect your skin')), advList(a)) : h('p', MT.t('UV is low. You do not need sun protection for most people. If you burn easily or are outside all day, still use a hat.')));
    host.appendChild(h('p.small.muted', MT.t('Source: WHO Global Solar UV Index. Protection is advised from UV 3.')));
  }
  function renderAir(host, air, vul) {
    var cat = air.aqi != null ? L.aqiCategory(air.aqi) : null;
    host.appendChild(h('div.result.band-' + (cat ? (cat.type === 'info' ? 'info' : cat.type) : 'info'), h('div.result-label', MT.t('Air quality (US AQI)')), air.aqi != null ? h('div.result-value', String(Math.round(air.aqi))) : null, cat ? h('div.result-title', MT.t(cat.label)) : null,
      air.pm25 != null ? h('p', { style: 'margin:.2rem 0' }, MT.t('Fine particles (PM2.5): {v} µg/m³, {band}.', { v: MT.fmt(air.pm25, 1, { trim: true }), band: MT.t(L.pm25Band(air.pm25)) })) : null));
    var tbl = h('table.table', h('thead', h('tr', h('th', MT.t('Pollutant')), h('th', MT.t('Now')), h('th', MT.t('WHO 2021 guideline')))), h('tbody',
      [['PM2.5', air.pm25, '15 µg/m³ (24-hour), 5 µg/m³ (year)'], ['PM10', air.pm10, '45 µg/m³ (24-hour), 15 (year)'], ['Ozone (O₃)', air.o3, '100 µg/m³ (8-hour)'], ['Nitrogen dioxide (NO₂)', air.no2, '25 µg/m³ (24-hour), 10 (year)']].map(function (r) {
        return h('tr', h('td', r[0]), h('td', r[1] != null ? MT.fmt(r[1], 1, { trim: true }) + ' µg/m³' : '—'), h('td', r[2]));
      })));
    host.appendChild(h('div.table-wrap', tbl));
    if (air.pm25Mean24 != null) host.appendChild(h('p.small', MT.t('Average PM2.5 over the next 24 hours: {v} µg/m³ (WHO 24-hour guideline: 15).', { v: MT.fmt(air.pm25Mean24, 1, { trim: true }) })));
    host.appendChild(h('div', h('h3', MT.t('What to do')), advList(airAdvice(air, vul.some(function (v) { return /^(heart|lung|pregnant|age65|age5)$/.test(v.id); })))));
    host.appendChild(h('p.small.muted', MT.t('Source: WHO global air quality guidelines (2021) and US EPA AQI. A yearly average above the WHO guideline still harms health, even on days that look clear.')));
  }

  /* ------------------------------------------------------------ tool */
  MT.registerTool({
    id: 'environment', title: 'Heat, sun and air', category: 'prevent', icon: '🌡️', order: 2,
    description: 'Check heat, UV and air quality where you are and get advice for your own health. Works offline with typed-in numbers.',
    keywords: ['heat', 'heatwave', 'uv', 'sun', 'air quality', 'pollution', 'pm2.5', 'smoke', 'weather', 'humidity', 'aqi', 'wet bulb', 'sunburn'],
    render: function (container) {
      var st = settings(), cache = MT.store.get(K_CACHE, null), vul = vulnerabilityNow();
      var live = h('div.stack'), manualOut = h('div.stack'), status = h('div', { 'aria-live': 'polite' }), searchOut = h('div');
      var alive = true;

      /* privacy + opt-in */
      var optIn = h('input', { type: 'checkbox', checked: !!st.optIn });
      var coordsDemo = '51.51, -0.13';
      container.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Before anything is sent')),
        h('p', MT.t('Salus works offline. This tool can look up weather and air quality for your place, but only if you say yes. Here is exactly what is sent:')),
        h('ul', h('li', MT.t('Your location, rounded to 2 decimals (about 1 km), for example {c}. It is sent to api.open-meteo.com and air-quality-api.open-meteo.com.', { c: coordsDemo })),
          h('li', MT.t('If you search for a city, the words you type are sent to geocoding-api.open-meteo.com.')),
          h('li', MT.t('Nothing else. Not your name, your health details or your passport.'))),
        h('p.small.muted', MT.t('Open-Meteo is a free weather service that asks for no key or account. Like any website, it can see your internet address. Your answer is saved on this phone so it also works offline.')),
        h('label.check', optIn, h('span.grow', MT.t('Yes, I allow Salus to contact Open-Meteo when I press the buttons below.')))));
      optIn.addEventListener('change', function () { setSettings({ optIn: optIn.checked }); syncButtons(); });

      /* location */
      var locLabel = h('p', { style: 'margin:0' }), btnGps = h('button.btn', { type: 'button' }, '📍 ' + MT.t('Use my location')), btnGet = h('button.btn.btn-primary', { type: 'button' }, '🔄 ' + MT.t('Get conditions now'));
      var cityIn = h('input', { type: 'search', placeholder: MT.t('Type a city or town'), autocomplete: 'off', maxlength: 60, 'aria-label': MT.t('City or town') }), btnCity = h('button.btn', { type: 'button' }, '🔍 ' + MT.t('Search'));
      function showLoc() { var l = settings().loc; locLabel.textContent = l ? MT.t('Place: {name} ({lat}, {lon})', { name: l.label || MT.t('your location'), lat: l.lat, lon: l.lon }) : MT.t('No place chosen yet.'); btnGet.disabled = !(l && settings().optIn); }
      function syncButtons() { var on = !!settings().optIn; [btnGps, btnCity, cityIn].forEach(function (b) { b.disabled = !on; }); showLoc(); }
      container.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('Where are you?')), locLabel,
        h('div.row', { style: 'margin-top:.5rem;--gap:.5rem' }, btnGps), h('div.input-group', { style: 'margin-top:.5rem' }, cityIn, btnCity), searchOut,
        h('div.row', { style: 'margin-top:.75rem;--gap:.5rem' }, btnGet), status));
      btnGps.addEventListener('click', function () {
        if (!navigator.geolocation) { status.replaceChildren(MT.ui.alert('warn', null, MT.t('This phone cannot share its location. Search for a city instead.'))); return; }
        status.replaceChildren(h('p.muted', MT.t('Asking for your location…')));
        navigator.geolocation.getCurrentPosition(function (p) { setSettings({ loc: { lat: r2(p.coords.latitude), lon: r2(p.coords.longitude), label: MT.t('My location') } }); showLoc(); fetchNow(); },
          function () { status.replaceChildren(MT.ui.alert('warn', MT.t('Could not get your location'), MT.t('You may have said no, or GPS is off. Search for a city instead.'))); }, { timeout: 12000, maximumAge: 600000 });
      });
      function search() {
        var q = cityIn.value.trim(); if (q.length < 2) { MT.toast(MT.t('Type at least 2 letters'), 'warn'); return; }
        if (navigator.onLine === false) { searchOut.replaceChildren(MT.ui.alert('warn', MT.t('You are offline'), MT.t('City search needs the internet. You can still type the temperature below.'))); return; }
        searchOut.replaceChildren(h('p.muted', MT.t('Searching…')));
        getJson(HOSTS.geo + '?name=' + encodeURIComponent(q) + '&count=6&language=en&format=json').then(function (r) {
          if (!alive) return;
          var res = (r && r.results || []).filter(function (x) { return num(x.latitude) != null && num(x.longitude) != null; });
          if (!res.length) { searchOut.replaceChildren(h('p', MT.t('No place found. Try another spelling.'))); return; }
          searchOut.replaceChildren(h('ul.env-results', { style: 'margin-top:.5rem' }, res.map(function (x) {
            var label = [x.name, x.admin1, x.country].filter(Boolean).join(', ');
            return h('li', h('button.btn.btn-sm', { type: 'button', onclick: function () { setSettings({ loc: { lat: r2(x.latitude), lon: r2(x.longitude), label: label.slice(0, 80) } }); searchOut.replaceChildren(); showLoc(); fetchNow(); } }, label));
          })));
        }).catch(function () { if (alive) searchOut.replaceChildren(MT.ui.alert('warn', MT.t('Could not search'), MT.t('The service did not answer. Check your internet and try again.'))); });
      }
      btnCity.addEventListener('click', search); cityIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } });

      function drawLive(c, stale) {
        MT.clear(live);
        if (!c) return;
        var when = new Date(c.t), age = Date.now() - c.t;
        live.appendChild(h('div.row', { style: 'justify-content:space-between;--gap:.5rem' }, h('h2.section-title', { style: 'margin:0' }, MT.t('Conditions for {name}', { name: (c.loc && c.loc.label) || MT.t('your place') })),
          MT.ui.badge(MT.t('Updated {time}', { time: MT.formatDate(when) + ' ' + MT.formatTime(when) }), age > 6 * 3600e3 || stale ? 'warn' : 'ok')));
        if (stale) live.appendChild(MT.ui.alert('warn', MT.t('Showing saved data'), MT.t('We could not get new data, so this is from the last time it worked. It may be out of date.')));
        else if (age > 6 * 3600e3) live.appendChild(MT.ui.alert('warn', MT.t('This data is old'), MT.t('Press "Get conditions now" to refresh it.')));
        var heat = h('section.card.stack'), uvc = h('section.card.stack'), air = h('section.card.stack');
        heat.appendChild(h('h3', { style: 'margin-top:0' }, '🌡️ ' + MT.t('Heat')));
        renderHeat(heat, c.current, vul, 'live');
        if (c.daily && c.daily.maxC != null) heat.appendChild(h('p.small', MT.t('Today: high {hi} °C, low {lo} °C.', { hi: f1(c.daily.maxC), lo: f1(c.daily.minC != null ? c.daily.minC : c.daily.maxC) }) + (c.daily.apparentMaxC != null ? ' ' + MT.t('Highest "feels like": {v} °C.', { v: f1(c.daily.apparentMaxC) }) : '')));
        live.appendChild(heat);
        var uv = (c.daily && c.daily.uvMax != null) ? c.daily.uvMax : (c.air && c.air.uv);
        if (uv != null) { uvc.appendChild(h('h3', { style: 'margin-top:0' }, '☀️ ' + MT.t('Sun'))); renderUv(uvc, uv); live.appendChild(uvc); }
        if (c.air) { air.appendChild(h('h3', { style: 'margin-top:0' }, '🌫️ ' + MT.t('Air'))); renderAir(air, c.air, vul); live.appendChild(air); }
        else live.appendChild(MT.ui.alert('info', MT.t('No air quality data'), MT.t('Air quality is not available for this place right now.')));
      }
      function fetchNow() {
        var l = settings().loc;
        if (!settings().optIn) { status.replaceChildren(MT.ui.alert('warn', null, MT.t('Tick the box above first.'))); return; }
        if (!l) { status.replaceChildren(MT.ui.alert('warn', null, MT.t('Choose a place first.'))); return; }
        if (navigator.onLine === false) { status.replaceChildren(MT.ui.alert('warn', MT.t('You are offline'), MT.t('Showing your last saved data. You can also type the temperature below.'))); drawLive(MT.store.get(K_CACHE, null), true); return; }
        status.replaceChildren(h('p.muted', MT.t('Getting the latest numbers…'))); btnGet.disabled = true;
        fetchAll({ lat: r2(l.lat), lon: r2(l.lon), label: l.label }).then(function (c) {
          MT.store.set(K_CACHE, c); if (!alive) return; status.replaceChildren(MT.ui.alert('ok', null, MT.t('Updated.'))); drawLive(c, false);
        }).catch(function (e) {
          if (!alive) return; status.replaceChildren(MT.ui.alert('warn', MT.t('Could not get the data'), MT.t('The service did not answer or you have a weak connection. Showing your last saved data if there is any.')));
          drawLive(MT.store.get(K_CACHE, null), true);
        }).then(function () { btnGet.disabled = false; });
      }
      btnGet.addEventListener('click', fetchNow);
      container.appendChild(live);
      if (cache && cache.current) drawLive(cache, navigator.onLine === false);
      syncButtons();

      /* manual mode */
      var man = MT.store.get(K_MAN, {}) || {};
      var tIn = h('input', { type: 'text', inputmode: 'decimal', value: man.temp != null ? String(man.temp) : '', autocomplete: 'off' }), rhIn = h('input', { type: 'text', inputmode: 'decimal', value: man.rh != null ? String(man.rh) : '', autocomplete: 'off' });
      var uvIn = h('input', { type: 'text', inputmode: 'decimal', value: man.uv != null ? String(man.uv) : '', autocomplete: 'off' });
      var unitSel = h('select', { 'aria-label': MT.t('Temperature unit') }, [h('option', { value: 'C', selected: man.unit !== 'F' }, '°C'), h('option', { value: 'F', selected: man.unit === 'F' }, '°F')]);
      function lab(text, ctl, hint) { var id = MT.uid('envf'); ctl.id = id; return h('div.field', h('label', { for: id }, text), ctl, hint ? h('div.hint', hint) : null); }
      function calcManual() {
        MT.clear(manualOut);
        var t = MT.num(tIn.value), rh = MT.num(rhIn.value), uv = MT.num(uvIn.value), unit = unitSel.value;
        MT.store.set(K_MAN, { temp: t, rh: rh, uv: uv, unit: unit });
        if (t == null || rh == null) { manualOut.appendChild(h('p.muted', MT.t('Enter the temperature and humidity to see the heat risk.'))); return; }
        var c = unit === 'F' ? L.fToC(t) : t;
        if (c < -30 || c > 60 || rh < 0 || rh > 100) { manualOut.appendChild(MT.ui.alert('warn', null, MT.t('Those numbers look wrong. Temperature must be -30 to 60 °C and humidity 0 to 100%.'))); return; }
        renderHeat(manualOut, { tempC: c, rh: rh }, vul, 'manual');
        if (uv != null && uv >= 0 && uv <= 16) renderUv(manualOut, uv);
      }
      [tIn, rhIn, uvIn].forEach(function (i) { i.addEventListener('input', calcManual); }); unitSel.addEventListener('change', calcManual);
      container.appendChild(h('section.card', h('h3', { style: 'margin-top:0' }, MT.t('No internet? Type the numbers')),
        h('p.muted.small', MT.t('Use a thermometer or the number from a weather app, radio or TV. Nothing is sent anywhere.')),
        h('div.form-grid', lab(MT.t('Temperature'), h('div.input-group', tIn, unitSel)), lab(MT.t('Humidity (%)'), rhIn, MT.t('Percent, 0 to 100')), lab(MT.t('UV index (optional)'), uvIn, MT.t('Often given in weather reports'))), manualOut));
      calcManual();
      if (vul.length) container.appendChild(h('p.small.muted', MT.t('Your advice takes your health into account: {list}.', { list: vul.map(function (v) { return MT.t(v.label); }).join('; ') })));
      else container.appendChild(h('p.small.muted', MT.t('Add your age, health conditions and medicines in your profile and medicine list so the advice fits you.')));
      container.appendChild(MT.ui.disclaimer(MT.t('This gives general safety advice only. If someone is confused, very hot or has fainted in the heat, treat it as an emergency.')));
      return function () { alive = false; };
    }
  });
})();
