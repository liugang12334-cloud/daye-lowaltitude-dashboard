/* ==========================================================
   大冶市低空经济综合运行服务平台 · 大屏演示逻辑
   - 五区布局 / 一主三专视图 / 四类演示场景
   - 地图层：空域网格、航线网络、起降场、实时目标、事件
   ========================================================== */
(function () {
  'use strict';

  const D = window.DEMO;
  const C = D.palette;
  const $ = (s, r = document) => r.querySelector(s);
  const nf = n => Number(n).toLocaleString('en-US');

  const STATE = {
    view: 'overview',
    scene: 'normal',
    auto: false,
    paused: false,
    layers: { airspace: true, routes: true, pads: true, targets: true, events: true, towns: true },
    bookmark: 'all',
    geoCenter: [114.855, 30.085],
    geoZoom: 1.0
  };

  /* ======================= 基础几何 ======================= */
  const padMap = {};
  D.pads.forEach(p => { padMap[p.id] = p; });

  function bezier(a, b, bend) {
    const mx = (a.lng + b.lng) / 2, my = (a.lat + b.lat) / 2;
    const dx = b.lng - a.lng, dy = b.lat - a.lat;
    const cx = mx - dy * bend, cy = my + dx * bend;
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, u = 1 - t;
      pts.push([u * u * a.lng + 2 * u * t * cx + t * t * b.lng,
                u * u * a.lat + 2 * u * t * cy + t * t * b.lat]);
    }
    return pts;
  }
  D.routes.forEach(r => { r.path = bezier(padMap[r.a], padMap[r.b], r.bend); });

  function circlePolygon(lng, lat, rKm, n) {
    n = n || 64;
    const dLat = rKm / 111.32;
    const dLng = rKm / (111.32 * Math.cos(lat * Math.PI / 180));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      pts.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
    }
    return pts;
  }

  function posAt(route, t) {
    const pts = route.path;
    const f = Math.max(0, Math.min(0.9999, t)) * (pts.length - 1);
    const i = Math.floor(f), k = f - i;
    const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }
  function headingAt(route, t, dir) {
    const p1 = posAt(route, t), p2 = posAt(route, Math.min(1, t + 0.012));
    let deg = Math.atan2(p2[0] - p1[0], p2[1] - p1[1]) * 180 / Math.PI;
    if (dir < 0) deg += 180;
    return deg;
  }

  /* ======================= 机队（实时目标） ======================= */
  let fleet = [];
  function buildFleet(n, hot) {
    fleet = [];
    const hotKind = D.routes.some(r => r.kind === hot) ? hot : 'commercial';
    const hotRoutes = D.routes.filter(r => r.kind === hotKind || r.kind === 'trunk');
    for (let i = 0; i < n; i++) {
      const r = i < Math.ceil(n * 0.45)
        ? hotRoutes[i % hotRoutes.length]
        : D.routes[(i * 3 + 1) % D.routes.length];
      const dir = i % 3 === 0 ? -1 : 1;
      const t = ((i * 0.173) % 0.86) + 0.07;
      const ac = {
        id: 'DY-' + String(2100 + i * 13),
        route: r, t, dir,
        type: i % 4 === 0 ? '垂起固定翼' : (i % 3 === 0 ? '复合翼' : '多旋翼'),
        alt: 80 + (i % 9) * 10,
        spd: (8.4 + (i % 6) * 1.3).toFixed(1),
        battery: 38 + (i * 7) % 58,
        head: 0, lng: 0, lat: 0, trail: []
      };
      const p = posAt(r, t);
      ac.lng = p[0]; ac.lat = p[1];
      ac.head = headingAt(r, t, dir);
      fleet.push(ac);
    }
  }

  /* ======================= 地图 ======================= */
  let mapChart = null;
  const chartStore = new WeakMap();

  function registerMaps() {
    const city = window.DAYE_GEO.features[0];
    const feats = [Object.assign({}, city, { properties: Object.assign({}, city.properties, { name: '大冶市' }) })];
    D.zones.forEach(z => {
      feats.push({
        type: 'Feature',
        properties: { name: z.name },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(z.lng, z.lat, z.r)] }
      });
    });
    echarts.registerMap('dayeFull', { type: 'FeatureCollection', features: feats });
  }

  function zoneTooltip(name) {
    const z = D.zones.find(x => x.name === name);
    if (!z) return `<b style="color:#9fe8ff">大冶市</b><br/>低空运行管控区域`;
    const prop = z.kind === 'nofly' ? '禁飞 · 未经批准不得进入'
      : z.kind === 'limit' ? '限飞 · 需空域申请与报备' : '适飞 · 计划报备后即可飞行';
    return `<b style="color:#9fe8ff">${z.name}</b><br/>管控属性：${prop}<br/>网格半径：约 ${z.r} km`;
  }

  function geoRegions() {
    const on = STATE.layers.airspace;
    const list = [{ name: '大冶市', itemStyle: { areaColor: '#0a1f36' } }];
    D.zones.forEach(z => {
      const st = D.zoneStyle[z.kind];
      list.push({
        name: z.name,
        itemStyle: on
          ? { areaColor: st.fill, borderColor: st.line, borderWidth: 1, shadowBlur: 14, shadowColor: st.line }
          : { areaColor: 'transparent', borderColor: 'transparent', borderWidth: 0, shadowBlur: 0 }
      });
    });
    return list;
  }

  function routeSeries() {
    if (!STATE.layers.routes) return [];
    const hot = D.scenes[STATE.scene].hot;
    const isHot = r => r.kind === 'trunk' || (hot === 'emergency' ? r.kind === 'medical' : r.kind === hot);
    return [
      {
        id: 'routeGlow', name: '航线光晕', type: 'lines', coordinateSystem: 'geo', polyline: true,
        silent: true, z: 3,
        data: D.routes.map(r => ({
          coords: r.path,
          lineStyle: { color: D.kindColor[r.kind], width: 9, opacity: isHot(r) ? 0.16 : 0.05 }
        }))
      },
      {
        id: 'routes', name: '航线', type: 'lines', coordinateSystem: 'geo', polyline: true, z: 4,
        data: D.routes.map(r => ({
          coords: r.path, routeId: r.id,
          lineStyle: { color: D.kindColor[r.kind], width: r.kind === 'trunk' ? 2.4 : 1.4, opacity: isHot(r) ? 0.95 : 0.42 }
        }))
      },
      {
        id: 'flow', name: '航线流光', type: 'lines', coordinateSystem: 'geo', polyline: true,
        silent: true, z: 5,
        effect: { show: true, period: 4.5, trailLength: 0.28, symbol: 'arrow', symbolSize: 6, color: '#c8f8ff' },
        lineStyle: { width: 0, opacity: 0 },
        data: D.routes.filter(isHot).map(r => ({ coords: r.path }))
      }
    ];
  }

  function padSeries() {
    if (!STATE.layers.pads) return [];
    const stateColor = s => s === 'normal' ? C.cyan : s === 'warn' ? C.amber : '#7c8fa3';
    return [{
      id: 'pads', name: '起降场', type: 'scatter', coordinateSystem: 'geo', z: 8,
      data: D.pads.map(p => ({
        name: p.name, value: [p.lng, p.lat], padId: p.id, level: p.level,
        symbol: p.level === 2 ? 'path://M0,-13 L10,0 L0,13 L-10,0 Z' : 'path://M0,-6 L6,0 L0,6 L-6,0 Z',
        symbolSize: p.level === 2 ? 17 : 10,
        itemStyle: {
          color: stateColor(p.state), borderColor: '#eaf9ff', borderWidth: p.level === 2 ? 1.4 : 0.8,
          shadowBlur: 12, shadowColor: stateColor(p.state), opacity: 0.95
        },
        label: p.level === 2 ? {
          show: true, position: 'bottom', distance: 6, color: '#bfe9ff', fontSize: 10,
          formatter: p.name.replace('枢纽', ''), backgroundColor: 'rgba(6,22,38,.72)',
          padding: [2, 5], borderRadius: 2
        } : { show: false }
      }))
    }];
  }

  function eventSeries() {
    if (!STATE.layers.events) return [];
    const evs = D.scenes[STATE.scene].events;
    return [{
      id: 'events', name: '事件', type: 'effectScatter', coordinateSystem: 'geo', z: 9,
      showEffectOn: 'render',
      rippleEffect: { brushType: 'stroke', scale: 3.6, period: 3 },
      data: evs.map((e, i) => ({
        name: e.name, value: [e.lng, e.lat], lv: e.lv,
        symbolSize: e.lv === 1 ? 13 : e.lv === 2 ? 10 : 8,
        itemStyle: {
          color: e.lv === 1 ? C.red : e.lv === 2 ? C.amber : C.blue,
          shadowBlur: 14, shadowColor: e.lv === 1 ? C.red : C.amber
        }
      }))
    }];
  }

  function townSeries() {
    if (!STATE.layers.towns) return [];
    return [{
      id: 'towns', name: '乡镇', type: 'scatter', coordinateSystem: 'geo', z: 7, silent: true,
      symbolSize: 1,
      data: D.towns.map(t => ({
        name: t.name, value: [t.lng, t.lat],
        label: {
          show: true, position: 'bottom', distance: 2,
          color: t.main ? 'rgba(200,240,255,.95)' : 'rgba(122,164,196,.85)',
          fontSize: t.main ? 11 : 9.5, fontWeight: t.main ? 600 : 400,
          formatter: t.name
        }
      }))
    }];
  }

  function orderFlowSeries() {
    const pairs = [
      ['H1', 'T5'], ['T1', 'T8'], ['H1', 'T4'], ['T2', 'H1'],
      ['H2', 'T6'], ['T1', 'T3'], ['H1', 'T7']
    ];
    const data = pairs.map((p, i) => {
      const a = padMap[p[0]], b = padMap[p[1]];
      return {
        coords: bezier(a, b, (i % 2 ? -1 : 1) * (0.1 + i * 0.02)),
        lineStyle: { color: i % 3 === 0 ? C.purple : C.cyan, width: 1.2, opacity: 0.75, curveness: 0 }
      };
    });
    return [{
      id: 'orderFlow', name: '订单流向', type: 'lines', coordinateSystem: 'geo', polyline: true,
      z: 7, silent: true,
      effect: { show: true, period: 3.2, trailLength: 0.4, symbol: 'circle', symbolSize: 4, color: '#c9b6ff' },
      lineStyle: { width: 1.2, opacity: 0.75 },
      data
    }];
  }

  function coverageSeries() {
    const pts = [
      { lng: 114.985, lat: 30.098, r: 'RID 覆盖 · 城区站' },
      { lng: 114.760, lat: 30.060, r: 'RID 覆盖 · 陈贵站' },
      { lng: 114.950, lat: 29.960, r: '雷达探测 · 南部' }
    ];
    return [{
      id: 'coverage', name: '感知覆盖', type: 'scatter', coordinateSystem: 'geo', z: 3,
      silent: true, symbol: 'circle', symbolSize: 175, z: 4,
      itemStyle: { color: 'rgba(47,227,255,.075)', borderColor: 'rgba(90,235,255,.6)', borderWidth: 1, shadowBlur: 14, shadowColor: 'rgba(47,227,255,.35)' },
      data: pts.map(p => ({ name: p.r, value: [p.lng, p.lat] }))
    }];
  }

  function deviceSeries() {
    const dev = [
      { name: 'RID 监测站 01', lng: 114.982, lat: 30.104 },
      { name: 'RID 监测站 02', lng: 114.740, lat: 30.030 },
      { name: '雷达探测站 01', lng: 114.905, lat: 30.075 },
      { name: '光电转台 01', lng: 114.960, lat: 30.115 },
      { name: '反制设备 01', lng: 115.000, lat: 30.090 }
    ];
    return [{
      id: 'devices', name: '通导监设备', type: 'scatter', coordinateSystem: 'geo', z: 9,
      symbol: 'triangle', symbolSize: 9,
      itemStyle: { color: '#a78bfa', borderColor: '#e6dcff', borderWidth: 0.8, shadowBlur: 10, shadowColor: '#a78bfa' },
      label: { show: true, position: 'right', distance: 4, color: 'rgba(200,220,255,.8)', fontSize: 9, formatter: p => p.name },
      data: dev.map(d => ({ name: d.name, value: [d.lng, d.lat] }))
    }];
  }

  function viewSeries() {
    if (STATE.view === 'logistics') return orderFlowSeries();
    if (STATE.view === 'safety') return coverageSeries();
    if (STATE.view === 'device') return deviceSeries();
    return [];
  }

  function orderFlowSeries() {
    const pairs = [
      ['H1', 'T5'], ['T1', 'T8'], ['H1', 'T4'], ['T2', 'H1'],
      ['H2', 'T6'], ['T1', 'T3'], ['H1', 'T7']
    ];
    const data = pairs.map((p, i) => {
      const a = padMap[p[0]], b = padMap[p[1]];
      return {
        coords: bezier(a, b, (i % 2 ? -1 : 1) * (0.1 + i * 0.02)),
        lineStyle: { color: i % 3 === 0 ? C.purple : C.cyan, width: 1.2, opacity: 0.75, curveness: 0 }
      };
    });
    return [{
      id: 'orderFlow', name: '订单流向', type: 'lines', coordinateSystem: 'geo', polyline: true,
      z: 7, silent: true,
      effect: { show: true, period: 3.2, trailLength: 0.4, symbol: 'circle', symbolSize: 4, color: '#c9b6ff' },
      lineStyle: { width: 1.2, opacity: 0.75 },
      data
    }];
  }

  function coverageSeries() {
    const pts = [
      { lng: 114.985, lat: 30.098, r: 'RID 覆盖 · 城区站' },
      { lng: 114.760, lat: 30.060, r: 'RID 覆盖 · 陈贵站' },
      { lng: 114.950, lat: 29.960, r: '雷达探测 · 南部' }
    ];
    return [{
      id: 'coverage', name: '感知覆盖', type: 'scatter', coordinateSystem: 'geo', z: 3,
      silent: true, symbol: 'circle', symbolSize: 175, z: 4,
      itemStyle: { color: 'rgba(47,227,255,.075)', borderColor: 'rgba(90,235,255,.6)', borderWidth: 1, shadowBlur: 14, shadowColor: 'rgba(47,227,255,.35)' },
      data: pts.map(p => ({ name: p.r, value: [p.lng, p.lat] }))
    }];
  }

  function deviceSeries() {
    const dev = [
      { name: 'RID 监测站 01', lng: 114.982, lat: 30.104 },
      { name: 'RID 监测站 02', lng: 114.740, lat: 30.030 },
      { name: '雷达探测站 01', lng: 114.905, lat: 30.075 },
      { name: '光电转台 01', lng: 114.960, lat: 30.115 },
      { name: '反制设备 01', lng: 115.000, lat: 30.090 }
    ];
    return [{
      id: 'devices', name: '通导监设备', type: 'scatter', coordinateSystem: 'geo', z: 9,
      symbol: 'triangle', symbolSize: 9,
      itemStyle: { color: '#a78bfa', borderColor: '#e6dcff', borderWidth: 0.8, shadowBlur: 10, shadowColor: '#a78bfa' },
      label: { show: true, position: 'right', distance: 4, color: 'rgba(200,220,255,.8)', fontSize: 9, formatter: p => p.name },
      data: dev.map(d => ({ name: d.name, value: [d.lng, d.lat] }))
    }];
  }

  function viewSeries() {
    if (STATE.view === 'logistics') return orderFlowSeries();
    if (STATE.view === 'safety') return coverageSeries();
    if (STATE.view === 'device') return deviceSeries();
    return [];
  }

  function targetSeries() {
    return {
      id: 'targets', name: '实时目标', type: 'scatter', coordinateSystem: 'geo', z: 10,
      data: [], symbol: 'path://M0,-9 L6.5,7 L0,3.6 L-6.5,7 Z'
    };
  }
  function trailSeries() {
    return {
      id: 'trail', name: '尾迹', type: 'lines', coordinateSystem: 'geo', polyline: true,
      silent: true, z: 6, data: []
    };
  }

  function mapOption() {
    return {
      backgroundColor: 'transparent',
      animationDurationUpdate: 260,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(6,18,32,.95)',
        borderColor: 'rgba(47,227,255,.35)',
        borderWidth: 1,
        padding: [8, 11],
        textStyle: { color: '#dff4ff', fontSize: 11, lineHeight: 18 },
        extraCssText: 'box-shadow:0 10px 30px rgba(0,0,0,.55);border-radius:3px;',
        formatter: function (p) {
          if (p.seriesId === 'routes') {
            const r = D.routes.find(x => x.id === (p.data && p.data.routeId));
            if (!r) return p.name;
            return `<b style="color:${D.kindColor[r.kind]}">${r.id} ${r.name}</b><br/>` +
              `航线类型：${D.kindName[r.kind]}<br/>航段里程：${r.km} km　高度层：${r.lvl} m<br/>` +
              `今日架次：${(r.km * 4.2).toFixed(0)} 架次　准时率：${(92 + r.km % 6).toFixed(1)}%`;
          }
          if (p.seriesId === 'pads') {
            const pad = padMap[p.data.padId];
            const st = pad.state === 'normal' ? '正常' : pad.state === 'warn' ? '告警' : '空闲';
            return `<b style="color:#9fe8ff">${pad.name}</b><br/>` +
              `${pad.level === 2 ? '二级枢纽' : '三级起降场'}　状态：${st}<br/>` +
              `充电桩 ${pad.charge}/${pad.chargeAll}　机位 ${pad.docks}<br/>今日架次：${60 + pad.docks * 14} 架次`;
          }
          if (p.seriesId === 'events') return `<b style="color:#ffb3bc">${p.data.lv === 1 ? 'Ⅰ级告警' : p.data.lv === 2 ? 'Ⅱ级告警' : 'Ⅲ级提示'}</b><br/>${p.data.name}`;
          if (p.seriesId === 'targets') {
            const ac = fleet.find(a => a.id === p.data.acId);
            if (!ac) return p.name;
            return `<b style="color:#9fe8ff">${ac.id} · ${ac.type}</b><br/>高度 ${ac.alt} m　速度 ${ac.spd} m/s<br/>电量 ${ac.battery}%　航线 ${ac.route.id}`;
          }
          return p.name || '';
        }
      },
      geo: {
        map: 'dayeFull',
        roam: true,
        center: STATE.geoCenter,
        zoom: STATE.geoZoom,
        scaleLimit: { min: 0.75, max: 9 },
        left: 6, right: 6, top: 34, bottom: 30,
        aspectScale: 0.86,
        silent: false,
        itemStyle: {
          areaColor: '#0a1f36',
          borderColor: 'rgba(84,196,255,.62)',
          borderWidth: 1.3,
          shadowColor: 'rgba(20,150,235,.55)',
          shadowBlur: 26,
          shadowOffsetY: 6
        },
        emphasis: { disabled: true },
        select: { disabled: true },
        label: { show: false },
        tooltip: { show: true, formatter: p => zoneTooltip(p.name) },
        regions: geoRegions(),
        z: 1
      },
      series: [].concat(
        viewSeries(),
        routeSeries(),
        padSeries(),
        eventSeries(),
        townSeries(),
        [trailSeries(), targetSeries()]
      )
    };
  }

  function applyMap() {
    if (!mapChart) return;
    mapChart.setOption(mapOption(), { notMerge: true });
    paintTargets(true);
  }

  function paintTargets() {
    if (!mapChart) return;
    const tData = [], trailData = [];
    fleet.forEach(a => {
      if (a.trail.length > 1) {
        for (let i = 1; i < a.trail.length; i++) {
          trailData.push({
            coords: [a.trail[i - 1], a.trail[i]],
            lineStyle: { color: '#7fe6ff', width: 1.4, opacity: (i / a.trail.length) * 0.55 }
          });
        }
      }
      tData.push({
        name: a.id, value: [a.lng, a.lat], acId: a.id, symbolRotate: a.head,
        symbolSize: 15,
        itemStyle: {
          color: a.battery < 26 ? C.amber : '#a6f4ff',
          borderColor: 'rgba(4,16,28,.9)', borderWidth: 1,
          shadowBlur: 12, shadowColor: a.battery < 26 ? C.amber : C.cyan
        },
        label: {
          show: STATE.layers.targets && (fleet.length <= 14 || tData.length % 2 === 0), position: 'right', distance: 5,
          formatter: a.id.replace('DY-', '') + '  ' + a.alt + 'm',
          color: 'rgba(200,242,255,.92)', fontSize: 9,
          backgroundColor: 'rgba(5,18,32,.62)', padding: [1, 4], borderRadius: 2
        }
      });
    });
    mapChart.setOption({
      series: [
        { id: 'trail', data: trailData },
        { id: 'targets', data: tData, label: { show: STATE.layers.targets } }
      ]
    });
  }

  /* ======================= 目标步进 ======================= */
  let acc = 0, lastNow = performance.now();
  function frame(now) {
    const dt = Math.min(0.5, (now - lastNow) / 1000);
    lastNow = now;
    if (!STATE.paused && fleet.length) {
      fleet.forEach(a => {
        a.t += a.dir * (a.spd * 10 * dt) / (a.route.km * 1000);
        if (a.t >= 1) { a.t = 1; a.dir = -1; }
        if (a.t <= 0) { a.t = 0; a.dir = 1; }
        const p = posAt(a.route, a.t);
        a.lng = p[0]; a.lat = p[1];
        a.head = headingAt(a.route, a.t, a.dir);
        a.trail.push([p[0], p[1]]);
        if (a.trail.length > 16) a.trail.shift();
      });
      acc += dt;
      if (acc > 0.22) { acc = 0; paintTargets(); }
    }
    requestAnimationFrame(frame);
    if (new URLSearchParams(location.search).get('modal') === '1') {
      renderMapping();
      $('#mappingModal').classList.add('show');
    }
    if (new URLSearchParams(location.search).get('modal') === '1') {
      renderMapping();
      $('#mappingModal').classList.add('show');
    }
  }

  /* ======================= 通用图表 ======================= */
  function mk(el, option) {
    if (!el) return null;
    let c = chartStore.get(el);
    if (!c) { c = echarts.init(el, null, { renderer: 'canvas' }); chartStore.set(el, c); }
    c.setOption(option, true);
    return c;
  }
  function disposeCharts(root) {
    if (!root) return;
    root.querySelectorAll('.chart').forEach(el => {
      const c = chartStore.get(el);
      if (c) { c.dispose(); chartStore.delete(el); }
    });
  }

  const TT = {
    trigger: 'item', backgroundColor: 'rgba(6,18,32,.95)', borderColor: 'rgba(47,227,255,.3)',
    textStyle: { color: '#dff4ff', fontSize: 11 }, padding: [6, 9],
    extraCssText: 'border-radius:3px;box-shadow:0 8px 24px rgba(0,0,0,.5)'
  };
  const AXIS_LABEL = { color: '#6f8ca8', fontSize: 9.5 };
  const SPLIT = { lineStyle: { color: 'rgba(120,160,196,.12)', type: 'dashed' } };

  function donutOption(data, total, unit) {
    return {
      tooltip: TT,
      series: [{
        type: 'pie', radius: ['62%', '86%'], center: ['50%', '54%'], startAngle: 90,
        itemStyle: { borderColor: 'rgba(4,10,19,.9)', borderWidth: 2 },
        label: { show: false }, labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 5, itemStyle: { shadowBlur: 16, shadowColor: 'rgba(47,227,255,.5)' } },
        data
      }],
      graphic: [
        { type: 'text', left: 'center', top: '40%', silent: true, style: { text: String(total), fill: '#e6f7ff', font: '700 26px "DIN Alternate",system-ui', textAlign: 'center' } },
        { type: 'text', left: 'center', top: '60%', silent: true, style: { text: unit, fill: '#5d7c9b', font: '10px system-ui', textAlign: 'center' } }
      ]
    };
  }

  function lineOption(x, series, opts) {
    opts = opts || {};
    return {
      grid: { left: 38, right: 12, top: 16, bottom: 18 },
      tooltip: Object.assign({}, TT, {
        trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: 'rgba(47,227,255,.35)' } }
      }),
      xAxis: {
        type: 'category', data: x, boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(120,160,196,.22)' } },
        axisTick: { show: false },
        axisLabel: Object.assign({}, AXIS_LABEL, { interval: opts.interval === undefined ? 3 : opts.interval })
      },
      yAxis: {
        type: 'value', name: opts.yName || '', min: opts.yMin, max: opts.yMax,
        nameTextStyle: { color: '#5d7c9b', fontSize: 9, padding: [0, 0, 0, -18] },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: Object.assign({}, AXIS_LABEL, { fontSize: 9 }),
        splitLine: SPLIT
      },
      series
    };
  }

  function areaSeries(name, data, color, dashed) {
    return {
      name, type: 'line', smooth: true, symbol: 'none', data,
      lineStyle: dashed
        ? { width: 1, type: 'dashed', color: 'rgba(140,175,205,.5)' }
        : { width: 2, color, shadowBlur: 10, shadowColor: color },
      areaStyle: dashed ? null : {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(47,227,255,.40)' },
          { offset: 1, color: 'rgba(47,227,255,0)' }
        ])
      },
      z: dashed ? 2 : 3
    };
  }

  function barHOption(cats, vals, color, unit) {
    const max = Math.max.apply(null, vals) * 1.25;
    return {
      grid: { left: 92, right: 46, top: 4, bottom: 2 },
      tooltip: TT,
      xAxis: { type: 'value', show: false, max },
      yAxis: {
        type: 'category', data: cats, inverse: true,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#8fb0cf', fontSize: 10 }
      },
      series: [{
        type: 'bar', data: vals, barWidth: 9,
        showBackground: true,
        backgroundStyle: { color: 'rgba(120,160,196,.1)', borderRadius: 5 },
        itemStyle: {
          borderRadius: 5,
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(47,227,255,.28)' }, { offset: 1, color }
          ])
        },
        label: { show: true, position: 'right', color: '#cfeaff', fontSize: 10, formatter: '{c}' + (unit || '') }
      }]
    };
  }

  function gaugeOption(val, title, min, max) {
    return {
      series: [{
        type: 'gauge', startAngle: 208, endAngle: -28, min: min, max: max,
        radius: '80%', center: ['50%', '58%'],
        progress: {
          show: true, width: 9, roundCap: true,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#2fe3ff' }, { offset: 1, color: '#35e08f' }
            ])
          }
        },
        axisLine: { lineStyle: { width: 9, color: [[1, 'rgba(120,160,196,.16)']] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { show: false }, anchor: { show: false },
        detail: {
          valueAnimation: true, offsetCenter: [0, '-2%'], fontSize: 22, fontWeight: 700,
          color: '#e6f7ff', fontFamily: 'DIN Alternate, system-ui', formatter: '{value}%'
        },
        title: { offsetCenter: [0, '30%'], fontSize: 9.5, color: '#5d7c9b' },
        data: [{ value: val, name: title }]
      }]
    };
  }

  function funnelOption(data) {
    return {
      tooltip: TT,
      series: [{
        type: 'funnel', left: '6%', right: '6%', top: 4, bottom: 4,
        minSize: '40%', maxSize: '100%', gap: 2, sort: 'descending',
        label: { show: true, position: 'inside', color: '#e9f8ff', fontSize: 10, formatter: '{b} {c}' },
        labelLine: { show: false },
        itemStyle: { borderWidth: 0, opacity: 0.9 },
        data
      }]
    };
  }

  /* ======================= KPI ======================= */
  function spark(values, color) {
    const w = 74, h = 22;
    const max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    const pts = values.map((v, i) => [
      i / (values.length - 1) * w,
      h - 2 - ((v - min) / (max - min || 1)) * (h - 6)
    ]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" opacity=".85"/></svg>`;
  }

  function renderKPI() {
    const s = D.scenes[STATE.scene];
    const cards = [
      {
        k: 'sorties', name: '今日飞行架次', v: nf(s.sorties), u: '架次',
        delta: s.delta, foot: '较昨日同期 ' + nf(s.sortiePrev),
        spark: spark([18, 24, 21, 33, 41, 38, 46, 52], C.cyan)
      },
      {
        k: 'airborne', name: '在飞目标', v: s.airborne, u: '架',
        foot: '空域内实时目标 · 点击高亮', live: true,
        spark: spark([6, 8, 7, 9, 11, 10, 9, s.airborne], C.green)
      },
      {
        k: 'online', name: '设备在线率', v: s.online.toFixed(1), u: '%',
        foot: '纳管 68 台 · 阈值 90%',
        cls: s.online < 90 ? 'warn' : '',
        spark: spark([96, 95, 96, 94, 95, 93, 94, s.online], C.blue)
      },
      {
        k: 'safe', name: '安全运行天数', v: 236, u: '天',
        foot: '自 2026-03-13 投运',
        spark: spark([120, 150, 170, 190, 205, 218, 228, 236], C.amber)
      },
      {
        k: 'orders', name: '今日订单量', v: nf(s.order), u: '单',
        delta: s.orderDelta, foot: '场景 5 类 · 物流运营屏',
        spark: spark([120, 180, 160, 260, 310, 280, 320, s.order / 4], C.purple)
      },
      {
        k: 'revenue', name: '今日营收', v: nf(s.revenue), u: '元',
        delta: s.revDelta, foot: '目标达成 78% · 结算口径',
        spark: spark([3.2, 4.1, 3.8, 5.2, 6.4, 6.1, 7.3, 8.6], C.pink)
      }
    ];
    $('#kpis').innerHTML = cards.map(c => {
      const d = c.delta === undefined ? '' :
        `<span class="kpi-delta ${c.delta >= 0 ? 'up' : 'down'}">${c.delta >= 0 ? '▲' : '▼'} ${Math.abs(c.delta)}%</span>`;
      return `<div class="kpi-card ${c.cls || ''}" data-kpi="${c.k}">
        <div class="kpi-top"><span class="kpi-name">${c.name}</span>${d}</div>
        <div class="kpi-value"><b>${c.v}</b><i>${c.u}</i></div>
        <div class="kpi-foot"><span>${c.foot}</span>${c.spark}</div>
      </div>`;
    }).join('');
  }

  function pulseKPI(key) {
    const el = document.querySelector(`.kpi-card[data-kpi="${key}"]`);
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 3000);
  }

  /* ======================= 面板片段 ======================= */
  function fleetBlock() {
    const f = D.scenes[STATE.scene].fleet;
    const rows = [
      { name: '飞行中', v: f.fly, c: C.cyan },
      { name: '空闲待命', v: f.idle, c: C.green },
      { name: '离线', v: f.off, c: '#7c8fa3' },
      { name: '维保中', v: f.maint, c: C.amber }
    ];
    return `<div class="fleet">
      <div class="fleet-chart chart" id="cFleet"></div>
      <ul class="fleet-legend">
        ${rows.map(r => `<li><i style="background:${r.c};box-shadow:0 0 8px ${r.c}"></i>${r.name}<b class="num">${r.v}</b></li>`).join('')}
      </ul></div>`;
  }
  function drawFleet(el) {
    const f = D.scenes[STATE.scene].fleet;
    const data = [
      { name: '飞行中', value: f.fly, itemStyle: { color: C.cyan } },
      { name: '空闲待命', value: f.idle, itemStyle: { color: C.green } },
      { name: '离线', value: f.off, itemStyle: { color: '#7c8fa3' } },
      { name: '维保中', value: f.maint, itemStyle: { color: C.amber } }
    ];
    mk(el.querySelector('#cFleet'), donutOption(data, f.fly + f.idle + f.off + f.maint, '在册设备 / 架'));
  }

  function airspaceBlock() {
    const a = D.scenes[STATE.scene].airspace;
    const s = D.scenes[STATE.scene];
    return `<div class="mini-stats">
        <div><b class="num">${a.apply}</b><span>今日申报</span></div>
        <div><b class="num">${a.approved}</b><span>已批准</span></div>
        <div><b class="num">${a.pending}</b><span>审批中</span></div>
        <div class="warn"><b class="num">${a.reject}</b><span>驳回</span></div>
      </div>
      <div class="zone-legend">
        <span><i style="background:rgba(255,77,97,.85)"></i>禁飞 8%</span>
        <span><i style="background:rgba(255,176,32,.85)"></i>限飞 24%</span>
        <span><i style="background:rgba(53,224,143,.8)"></i>适飞 68%</span>
      </div>
      <div class="bar-stack"><i class="n" style="width:8%"></i><i class="l" style="width:24%"></i><i class="o" style="width:68%"></i></div>
      <div class="notice"><span class="pulse-dot"></span><span>${s.notice}</span></div>`;
  }

  function alertBlock(list) {
    const lvTxt = { 1: 'Ⅰ级', 2: 'Ⅱ级', 3: 'Ⅲ级' };
    return `<div class="alert-list">${list.map(a => `
      <div class="alert-item lv${a.lv} ${a.lv === 1 ? 'blink' : ''}">
        <span class="lv">${lvTxt[a.lv]}</span>
        <span class="txt">${a.txt}</span>
        <span class="tm num">${a.t}</span>
      </div>`).join('')}</div>`;
  }

  const TREND_SHAPE = [2, 1.5, 1, 1, 2, 3.5, 8, 17, 25, 30, 33, 29, 25, 22, 20, 18, 15, 12, 9, 6, 4.5, 3.5, 3, 2];

  function trendPairs(total) {
    const hour = new Date().getHours();
    const sum = TREND_SHAPE.reduce((a, b) => a + b, 0);
    const k = total / sum;
    const actual = [], fc = [];
    TREND_SHAPE.forEach((v, i) => {
      if (i <= hour) { actual.push(Math.round(v * k)); fc.push(i === hour ? Math.round(v * k) : null); }
      else { actual.push(null); fc.push(Math.round(v * k * 1.05)); }
    });
    return { actual, fc };
  }

  function trendPairs(total) {
    const hour = new Date().getHours();
    const sum = TREND_SHAPE.reduce((a, b) => a + b, 0);
    const k = total / sum;
    const actual = [], fc = [];
    TREND_SHAPE.forEach((v, i) => {
      if (i <= hour) { actual.push(Math.round(v * k)); fc.push(i === hour ? Math.round(v * k) : null); }
      else { actual.push(null); fc.push(Math.round(v * k * 1.05)); }
    });
    return { actual, fc };
  }

  function trendSeriesOf(total) {
    const hour = new Date().getHours();
    const sum = TREND_SHAPE.reduce((a, b) => a + b, 0);
    const k = total / sum;
    return TREND_SHAPE.map((v, i) => i <= hour ? Math.round(v * k) : null);
  }

  /* ======================= 视图定义 ======================= */
  const VIEWS = {
    overview: {
      mapSub: '大冶市域 · 空域网格 / 航线网络 / 实时目标',
      left: [
        { title: '机队状态', tag: '四态分布 · 实时', html: fleetBlock, after: drawFleet },
        { title: '空域态势与审批', tag: '市级平台同步', html: airspaceBlock },
        { title: '设备告警', tag: '最近 5 条 · 实时推送', html: () => alertBlock(D.alerts[STATE.scene]) }
      ],
      right: [
        {
          title: '24 小时飞行架次趋势', tag: '准实时 30s', html: () => `<div class="chart" id="cTrend"></div>`,
          after: el => {
            const s = D.scenes[STATE.scene];
            const x = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
            const tp = trendPairs(s.sorties);
            const today = tp.actual;
            const yest = trendSeriesOf(s.sortiePrev);
            const opt = lineOption(x, [
              areaSeries('昨日同期', yest, C.cyan, true),
              {
                name: '今日预测', type: 'line', smooth: true, symbol: 'none', data: tp.fc,
                lineStyle: { width: 1.4, type: 'dotted', color: 'rgba(47,227,255,.55)' }, z: 3
              },
              Object.assign(areaSeries('今日架次', today, C.cyan, false), {
                markPoint: {
                  symbol: 'circle', symbolSize: 7, data: [{ type: 'max', name: '峰值' }],
                  itemStyle: { color: C.amber, borderColor: '#fff', borderWidth: 1 },
                  label: { show: true, position: 'top', color: '#ffd479', fontSize: 9, formatter: '峰值 {c}' }
                }
              })
            ]);
            opt.legend = {
              show: true, right: 2, top: -4, itemWidth: 8, itemHeight: 2, itemGap: 8,
              textStyle: { color: '#6f8ca8', fontSize: 8.5 }
            };
            opt.series.forEach(sr => {
              if (sr.markPoint) sr.markPoint.label.position = 'bottom';
            });
            mk(el.querySelector('#cTrend'), opt);
          }
        },
        {
          title: '任务场景构成', tag: '今日订单口径',
          html: () => {
            const share = D.scenes[STATE.scene].sceneShare;
            const colors = [C.cyan, C.amber, C.pink, C.purple, C.green];
            const total = share.reduce((a, b) => a + b.value, 0);
            return `<div class="fleet">
              <div class="fleet-chart chart" id="cScenePie"></div>
              <ul class="fleet-legend" style="gap:6px">
                ${share.map((s, i) => `<li><i style="background:${colors[i]};box-shadow:0 0 8px ${colors[i]}"></i>${s.name}<b class="num" style="font-size:12px">${(s.value / total * 100).toFixed(0)}%</b></li>`).join('')}
              </ul></div>`;
          },
          after: el => {
            const share = D.scenes[STATE.scene].sceneShare;
            const colors = [C.cyan, C.amber, C.pink, C.purple, C.green];
            const total = share.reduce((a, b) => a + b.value, 0);
            mk(el.querySelector('#cScenePie'), {
              tooltip: TT,
              series: [{
                type: 'pie', radius: ['58%', '86%'], center: ['50%', '52%'],
                data: share.map((s, i) => ({ name: s.name, value: s.value, itemStyle: { color: colors[i] } })),
                itemStyle: { borderColor: 'rgba(4,10,19,.9)', borderWidth: 2 },
                label: { show: false }, labelLine: { show: false },
                emphasis: { scale: true, scaleSize: 5 }
              }],
              graphic: [
                { type: 'text', left: 'center', top: '42%', silent: true, style: { text: nf(total), fill: '#e6f7ff', font: '700 20px "DIN Alternate",system-ui', textAlign: 'center' } },
                { type: 'text', left: 'center', top: '60%', silent: true, style: { text: '订单 / 单', fill: '#5d7c9b', font: '9.5px system-ui', textAlign: 'center' } }
              ]
            });
          }
        },
        { title: '起降场单量 TOP5', tag: '环比', html: rankBlock }
      ]
    },

    device: {
      mapSub: '设备空间分布 · 台账 / 健康 / 告警全量',
      left: [
        {
          title: '分类设备在线率', tag: '在线 / 总数', html: () => `<div class="chart" id="cOnline"></div>`,
          after: el => mk(el.querySelector('#cOnline'),
            barHOption(['无人机', '起降场设施', '通导监设备', '感知设备'], [94.1, 96.2, 85.7, 88.9], C.cyan, '%'))
        },
        {
          title: '设备台账构成', tag: '纳管 117 台/套',
          html: () => `<div class="fleet">
            <div class="fleet-chart chart" id="cAssets"></div>
            <ul class="fleet-legend">
              <li><i style="background:${C.cyan};box-shadow:0 0 8px ${C.cyan}"></i>无人机<b class="num">68</b></li>
              <li><i style="background:${C.blue};box-shadow:0 0 8px ${C.blue}"></i>起降场设施<b class="num">26</b></li>
              <li><i style="background:${C.purple};box-shadow:0 0 8px ${C.purple}"></i>通导监设备<b class="num">14</b></li>
              <li><i style="background:${C.green};box-shadow:0 0 8px ${C.green}"></i>感知设备<b class="num">9</b></li>
            </ul></div>`,
          after: el => {
            const data = [
              { name: '无人机', value: 68, itemStyle: { color: C.cyan } },
              { name: '起降场设施', value: 26, itemStyle: { color: C.blue } },
              { name: '通导监设备', value: 14, itemStyle: { color: C.purple } },
              { name: '感知设备', value: 9, itemStyle: { color: C.green } }
            ];
            mk(el.querySelector('#cAssets'), donutOption(data, 117, '设备总数'));
          }
        },
        {
          title: '维保与生命周期提醒', tag: '7 日内',
          html: () => `<div class="alert-list">
            <div class="alert-item lv2"><span class="lv">维保</span><span class="txt">UAV-0210 累计航时 486h，达保养阈值</span><span class="tm num">11-06</span></div>
            <div class="alert-item lv2"><span class="lv">维保</span><span class="txt">UAV-0145 电池循环 318 次，建议更换</span><span class="tm num">11-08</span></div>
            <div class="alert-item lv3"><span class="lv">入网</span><span class="txt">UAV-0312 已完成注册与接入认证</span><span class="tm num">14:22</span></div>
            <div class="alert-item lv3"><span class="lv">停用</span><span class="txt">UAV-0074 提交停用申请，待审批</span><span class="tm num">13:58</span></div>
          </div>`
        }
      ],
      right: [
        {
          title: '选中设备实时参数', tag: 'UAV-0237 · 多旋翼',
          html: () => `<div class="kv-grid">
            <div class="kv"><span>飞行高度</span><b class="num">118 m</b></div>
            <div class="kv"><span>飞行速度</span><b class="num">11.4 m/s</b></div>
            <div class="kv"><span>电池电量</span><b class="num" style="color:#ffb020">19%</b></div>
            <div class="kv"><span>信号强度</span><b class="num">-72 dBm</b></div>
            <div class="kv"><span>当日航时</span><b class="num">3.6 h</b></div>
            <div class="kv"><span>累计架次</span><b class="num">1,284</b></div>
          </div>
          <div class="notice" style="margin-top:8px"><span class="pulse-dot"></span><span>低电量告警：建议 3 分钟内就近降落至城东驿站</span></div>`
        },
        {
          title: '近 7 日在线率', tag: '设备域指标', html: () => `<div class="chart" id="cWeek"></div>`,
          after: el => {
            const x = ['10-29', '10-30', '10-31', '11-01', '11-02', '11-03', '11-04'];
            const y = [95.2, 96.1, 94.8, 93.5, 95.9, 96.4, D.scenes[STATE.scene].online];
            mk(el.querySelector('#cWeek'), lineOption(x,
              [areaSeries('在线率', y, C.green, false)], { interval: 0, yName: '%', yMin: 88, yMax: 100 }));
          }
        },
        { title: '今日告警全量', tag: '12 条 · 按级别排序', html: () => alertBlock(D.alerts[STATE.scene]) }
      ]
    },

    logistics: {
      mapSub: '订单流向 · 时效 / 驿站 / 经营',
      left: [
        {
          title: '24 小时订单量', tag: '日 / 周 / 月 · 当前 日', html: () => `<div class="chart" id="cOrderTrend"></div>`,
          after: el => {
            const s = D.scenes[STATE.scene];
            const x = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
            const tp = trendPairs(s.order);
            const yest = trendSeriesOf(Math.round(s.order * 0.9));
            mk(el.querySelector('#cOrderTrend'), lineOption(x, [
              areaSeries('昨日', yest, C.purple, true),
              {
                name: '预测', type: 'line', smooth: true, symbol: 'none', data: tp.fc,
                lineStyle: { width: 1.4, type: 'dotted', color: 'rgba(167,139,250,.6)' }, z: 3
              },
              areaSeries('今日订单', tp.actual, C.purple, false)
            ]));
          }
        },
        {
          title: '场景订单占比', tag: '五类场景', html: () => `<div class="chart" id="cScene2"></div>`,
          after: el => {
            const share = D.scenes[STATE.scene].sceneShare;
            const colors = [C.cyan, C.amber, C.pink, C.purple, C.green];
            mk(el.querySelector('#cScene2'), {
              tooltip: TT,
              legend: {
                orient: 'vertical', right: 0, top: 'middle', itemWidth: 7, itemHeight: 7,
                itemGap: 9, textStyle: { color: '#8fb0cf', fontSize: 9.5 }
              },
              series: [{
                type: 'pie', roseType: 'radius', radius: ['24%', '78%'], center: ['32%', '52%'],
                data: share.map((s, i) => ({ name: s.name, value: s.value, itemStyle: { color: colors[i] } })),
                itemStyle: { borderColor: 'rgba(4,10,19,.9)', borderWidth: 2 },
                label: { show: false }, labelLine: { show: false }
              }]
            });
          }
        },
        {
          title: '配送时效', tag: '承诺 30 分钟', html: () => `<div class="chart" id="cGauge"></div>`,
          after: el => mk(el.querySelector('#cGauge'), gaugeOption(96.2, '准时率 · 平均 21.6 分钟', 80, 100))
        }
      ],
      right: [
        { title: '驿站单量 TOP5', tag: '今日 · 环比', html: rankBlock },
        {
          title: '收入构成', tag: '今日 8.64 万元',
          html: () => `<div style="display:flex;flex-direction:column;gap:9px;justify-content:center;height:100%">
            ${[
              ['商业配送', 42, C.cyan, '3.63 万'],
              ['医疗转运', 24, C.pink, '2.07 万'],
              ['景区接驳', 16, C.amber, '1.38 万'],
              ['工业急件', 11, C.purple, '0.95 万'],
              ['农产品外运', 7, C.green, '0.61 万']
            ].map(r => `<div class="rank-row" style="grid-template-columns:56px 1fr auto">
                <span style="font-size:10.5px;color:#8fb0cf">${r[0]}</span>
                <span class="bar"><i style="width:${r[1] * 2}%;background:linear-gradient(90deg,rgba(47,227,255,.25),${r[2]})"></i></span>
                <span class="val num">${r[3]}<em>${r[1]}%</em></span>
              </div>`).join('')}
          </div>`
        },
        {
          title: '干线运力进度', tag: '对标 日均 2 架次',
          html: () => `<div style="display:flex;flex-direction:column;gap:11px;justify-content:center;height:100%">
            ${[
              ['G1 北站—城东驿站', 82, '9 / 11 架次'],
              ['G2 北站—陈贵镇站', 64, '7 / 11 架次'],
              ['M1 医疗转运专线', 96, '14 / 15 架次']
            ].map(r => `<div>
                <div style="display:flex;justify-content:space-between;font-size:10.5px;color:#8fb0cf;margin-bottom:4px">
                  <span>${r[0]}</span><span class="num" style="color:#cfeaff">${r[2]}</span></div>
                <div class="bar-stack" style="height:7px;margin:0;background:rgba(120,160,196,.12);border-radius:4px">
                  <i class="o" style="width:${r[1]}%;border-radius:4px"></i></div>
              </div>`).join('')}
          </div>`
        }
      ]
    },

    safety: {
      mapSub: '空域盯防 · 感知覆盖 / 违规治理 / 处置闭环',
      left: [
        {
          title: '感知态势统计', tag: '今日 · 对标 95%',
          html: () => `<div class="mini-stats">
            <div><b class="num">128</b><span>合作目标</span></div>
            <div class="warn"><b class="num">3</b><span>非合作目标</span></div>
            <div><b class="num">95.7</b><span>识别率 %</span></div>
            <div><b class="num">0.8</b><span>响应 秒</span></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#8fb0cf;margin:2px 0 4px">
            <span>目标识别率 · 对标 95%</span><span style="color:#35e08f">已达标 95.7%</span></div>
          <div class="bar-stack"><i class="o" style="width:95.7%"></i><i class="n" style="width:4.3%"></i></div>
          <div class="notice" style="margin-top:6px"><span class="pulse-dot"></span><span>RID 覆盖 6 站 / 雷达 2 部 / 反制 1 套，全域覆盖率 78%</span></div>`
        },
        {
          title: '违规事件类型分布', tag: '本月 42 起', html: () => `<div class="chart" id="cViolate"></div>`,
          after: el => mk(el.querySelector('#cViolate'),
            barHOption(['闯入禁飞区', '超高度飞行', '偏离申报航线', '未报备起飞', '夜间违规'], [13, 11, 8, 6, 4], C.red, ' 起'))
        },
        {
          title: '安全事件时间线', tag: '近 3 日',
          html: () => `<div class="timeline">
            <div class="tl-item"><span class="tm num">14:20</span><b>中心城区临时禁飞</b> · 3 条航线自动改航</div>
            <div class="tl-item"><span class="tm num">11-03</span><b>非合作目标 1 架次</b> · 已移交处置，用时 6 分钟</div>
            <div class="tl-item"><span class="tm num">11-02</span><b>超高度飞行 1 起</b> · 已约谈运营主体</div>
            <div class="tl-item"><span class="tm num">11-01</span><b>闯入限飞区边缘 2 起</b> · 语音喊话劝离</div>
          </div>`
        }
      ],
      right: [
        {
          title: '处置闭环', tag: '发现 → 核实 → 处置 → 归档', html: () => `<div class="chart" id="cFunnel"></div>`,
          after: el => mk(el.querySelector('#cFunnel'), funnelOption([
            { name: '发现', value: 42, itemStyle: { color: 'rgba(47,227,255,.85)' } },
            { name: '核实', value: 38, itemStyle: { color: 'rgba(75,155,255,.85)' } },
            { name: '处置', value: 35, itemStyle: { color: 'rgba(53,224,143,.85)' } },
            { name: '归档', value: 33, itemStyle: { color: 'rgba(255,176,32,.85)' } }
          ]))
        },
        {
          title: '处置时效', tag: '平均 / 超时',
          html: () => `<div class="kv-grid">
            <div class="kv"><span>平均处置时长</span><b class="num">6.4 分</b></div>
            <div class="kv"><span>最短处置</span><b class="num">1.8 分</b></div>
            <div class="kv"><span>超时未处置</span><b class="num" style="color:#ff8a95">2 起</b></div>
            <div class="kv"><span>闭环率</span><b class="num" style="color:#35e08f">92.4%</b></div>
          </div>
          <div style="margin-top:10px">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#5d7c9b;margin-bottom:4px">
              <span>1 分钟内响应</span><span class="num">76%</span></div>
            <div class="bar-stack" style="height:6px;margin:0;border-radius:3px"><i class="o" style="width:76%;border-radius:3px"></i></div>
          </div>`
        },
        { title: '重点防控区域', tag: '违规起数', html: rankBlock }
      ]
    }
  };

  const RANKS = {
    overview: [['大冶北站综合枢纽', 186, 8.6], ['铜绿山景区枢纽', 142, 4.2], ['城东驿站', 118, -2.1], ['陈贵镇站', 96, 12.4], ['灵乡站', 74, 3.3]],
    logistics: [['城东驿站', 268, 11.2], ['大冶北站综合枢纽', 236, 6.8], ['铜绿山景区枢纽', 164, -3.4], ['大箕铺站', 132, 9.1], ['陈贵镇站', 108, 4.6]],
    safety: [['中心城区', 16, 0], ['大冶北站净空区', 9, 0], ['铜绿山景区', 7, 0], ['城东片区', 6, 0], ['陈贵镇片区', 4, 0]]
  };

  function rankBlock() {
    const rows = RANKS[STATE.view] || RANKS.overview;
    const max = Math.max.apply(null, rows.map(r => r[1]));
    return `<div class="rank-list">${rows.map((r, i) => `
      <div class="rank-row">
        <span class="idx ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <span class="bar"><i style="width:${(r[1] / max * 92).toFixed(1)}%"></i><span>${r[0]}</span></span>
        <span class="val num">${r[1]}<em style="color:${r[2] > 0 ? '#ff8a95' : r[2] < 0 ? '#5ef0a8' : '#5d7c9b'}">${r[2] > 0 ? '▲' + r[2] : r[2] < 0 ? '▼' + Math.abs(r[2]) : '—'}%</em></span>
      </div>`).join('')}</div>`;
  }

  /* ======================= 视图渲染 ======================= */
  function panel(spec) {
    const el = document.createElement('div');
    el.className = 'panel';
    el.innerHTML = `<div class="p-head"><span class="p-dot"></span><h3>${spec.title}</h3>
      <span class="p-tag">${spec.tag || ''}</span></div>
      <div class="p-body">${spec.html ? spec.html() : ''}</div>`;
    if (spec.after) requestAnimationFrame(() => spec.after(el));
    return el;
  }

  function renderView() {
    const L = $('#leftCol'), R = $('#rightCol');
    disposeCharts(L); disposeCharts(R);
    L.innerHTML = ''; R.innerHTML = '';
    const cfg = VIEWS[STATE.view];
    cfg.left.forEach(s => L.appendChild(panel(s)));
    cfg.right.forEach(s => R.appendChild(panel(s)));
    $('#mapSub').textContent = cfg.mapSub;
    document.querySelectorAll('#viewTabs button').forEach(b => b.classList.toggle('on', b.dataset.view === STATE.view));
    document.querySelectorAll('#sceneTabs button').forEach(b => b.classList.toggle('on', b.dataset.scene === STATE.scene));
    $('#mapSceneTxt').textContent = '演示场景：' + D.scenes[STATE.scene].name;
    renderKPI();
  }

  /* ======================= 地图交互 ======================= */
  const BM = {
    all: { center: [114.855, 30.085], zoom: 1.0 },
    city: { center: [114.985, 30.098], zoom: 3.6 },
    trunk: { center: [114.90, 30.09], zoom: 2.3 }
  };

  function moveTo(target) {
    const fromC = STATE.geoCenter.slice(), fromZ = STATE.geoZoom;
    const t0 = performance.now(), dur = 520;
    function step() {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      STATE.geoCenter = [fromC[0] + (target.center[0] - fromC[0]) * e, fromC[1] + (target.center[1] - fromC[1]) * e];
      STATE.geoZoom = fromZ + (target.zoom - fromZ) * e;
      mapChart.setOption({ geo: { center: STATE.geoCenter, zoom: STATE.geoZoom } });
      if (k < 1) requestAnimationFrame(step);
    }
    step();
  }

  function hideCard() { $('#targetCard').classList.remove('show'); }

  function showCard(html, lnglat) {
    const card = $('#targetCard');
    card.innerHTML = html;
    card.classList.add('show');
    let px = [0, 0];
    try { px = mapChart.convertToPixel({ geoIndex: 0 }, lnglat) || [0, 0]; } catch (e) { /* ignore */ }
    const wrap = document.querySelector('.map-wrap');
    const W = wrap.clientWidth, H = wrap.clientHeight;
    let left = px[0] + 16, top = px[1] - 40;
    if (left + 246 > W - 8) left = px[0] - 254;
    if (top < 8) top = 8;
    if (top + 190 > H - 8) top = H - 198;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function onMapClick(p) {
    if (p.seriesId === 'targets') {
      const ac = fleet.find(a => a.id === p.data.acId);
      if (!ac) return;
      showCard(`<h4>${ac.id}<span class="tag">${ac.type}</span></h4>
        <div class="tc-grid">
          <div>高度<b>${ac.alt} m</b></div><div>速度<b>${ac.spd} m/s</b></div>
          <div>电量<b style="color:${ac.battery < 26 ? '#ffb020' : '#7fe6ff'}">${ac.battery}%</b></div>
          <div>航向<b>${Math.round(ac.head)}°</b></div>
          <div>航线<b>${ac.route.id}</b></div><div>高度层<b>${ac.route.lvl} m</b></div>
        </div>
        <div class="tc-foot"><span>任务：${D.kindName[ac.route.kind]}</span><span style="color:#35e08f">● 数据 1s 刷新</span></div>`,
        [ac.lng, ac.lat]);
      pulseKPI('airborne');
    } else if (p.seriesId === 'pads') {
      const pad = padMap[p.data.padId];
      showCard(`<h4>${pad.name}<span class="tag">${pad.level === 2 ? '二级枢纽' : '三级起降场'}</span></h4>
        <div class="tc-grid">
          <div>充电桩<b>${pad.charge}/${pad.chargeAll}</b></div><div>机位<b>${pad.docks}</b></div>
          <div>今日架次<b>${60 + pad.docks * 14}</b></div><div>状态<b>${pad.state === 'normal' ? '正常' : pad.state === 'warn' ? '告警' : '空闲'}</b></div>
        </div>
        <div class="tc-foot"><span>所属：大冶市低空运营中心</span><span style="color:#7fe6ff">点击查看台账</span></div>`,
        [pad.lng, pad.lat]);
    } else hideCard();
  }

  /* ======================= 场景 / 视图切换 ======================= */
  const sceneOrder = ['normal', 'peak', 'medical', 'emergency'];

  function setScene(key) {
    hideCard();
    STATE.scene = key;
    const s = D.scenes[key];
    buildFleet(s.airborne, s.hot);
    document.querySelectorAll('#sceneTabs button').forEach(b => b.classList.toggle('on', b.dataset.scene === key));
    $('#mapSceneTxt').textContent = '演示场景：' + s.name;
    applyMap();
    renderView();
    toast('演示场景切换 · ' + s.name);
  }

  function setView(key) {
    hideCard();
    STATE.view = key;
    document.querySelectorAll('#viewTabs button').forEach(b => b.classList.toggle('on', b.dataset.view === key));
    renderView();
    toast('视图切换 · ' + document.querySelector(`#viewTabs button[data-view="${key}"]`).textContent);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 1900);
  }

  /* ======================= 底部滚动 ======================= */
  function renderTicker() {
    const s = D.scenes[STATE.scene];
    const lvTxt = { 1: 'Ⅰ级', 2: 'Ⅱ级', 3: 'Ⅲ级' };
    const aRows = D.alerts[STATE.scene].map(a =>
      `<div class="tk-row"><span class="${a.lv === 1 ? 'red' : a.lv === 2 ? 'amber' : 'dim'}">${lvTxt[a.lv]}</span>
       <b>${a.txt}</b><span class="dim" style="margin-left:auto">${a.t}</span></div>`).join('');
    const oRows = D.orders.map(o =>
      `<div class="tk-row"><b>${o.no}</b><span>${o.goods}</span>
       <span class="dim">${o.from} → ${o.to}</span><span style="margin-left:auto;color:#7fe6ff">${o.state}</span></div>`).join('');
    const lRows = D.links.map(l =>
      `<div class="tk-row"><b>${l.name}</b>
       <span class="${l.state === '已连接' || l.state === '正常' ? 'amber' : 'dim'}">${l.state}</span>
       <span class="dim">同步 ${l.sync}</span><span class="dim" style="margin-left:auto">接口 ${l.api}</span></div>`).join('');
    $('#tkAlerts').innerHTML = aRows + aRows;
    $('#tkOrders').innerHTML = oRows + oRows;
    $('#tkLinks').innerHTML = lRows + lRows;
  }

  /* ======================= 语音助手 ======================= */
  const ASK = {
    sortie: () => {
      const s = D.scenes[STATE.scene];
      pulseKPI('sorties');
      return `今天截至目前累计飞行 <b>${s.sorties} 架次</b>，较昨日同期（${s.sortiePrev} 架次）<b>${s.delta >= 0 ? '增加' : '减少'} ${Math.abs(s.delta)}%</b>，日均目标完成 78%。`;
    },
    fleet: () => {
      const f = D.scenes[STATE.scene].fleet;
      pulseKPI('online');
      return `在册无人机 <b>68 架</b>：飞行中 ${f.fly} 架、空闲待命 ${f.idle} 架、离线 ${f.off} 架、维保中 ${f.maint} 架；设备在线率 <b>${D.scenes[STATE.scene].online}%</b>。`;
    },
    alarm: () => {
      const a = D.alerts[STATE.scene].filter(x => x.lv === 1);
      return a.length
        ? `当前有 <b>${a.length} 条Ⅰ级告警</b>：${a.map(x => x.txt).join('；')}。已同步至左栏告警列表与地图事件图层。`
        : `当前无Ⅰ级告警，均为Ⅱ级以下提示，设备运行正常。`;
    },
    zoom: () => {
      moveTo(BM.city);
      STATE.bookmark = 'city';
      document.querySelectorAll('#bookmarks .tb-btn').forEach(b => b.classList.toggle('on', b.dataset.bm === 'city'));
      return `已定位至 <b>大冶城区</b>，当前展示中心城区空域网格与实时目标，共 ${fleet.length} 架在飞。`;
    }
  };

  function ask(kind) {
    STATE.askTouched = true;
    const panelEl = $('#asPanel');
    panelEl.classList.add('show');
    const reply = ASK[kind] ? ASK[kind]() : '暂未识别该指令，已转人工值守。';
    $('#asReply').innerHTML = reply;
    setTimeout(() => { $('#asReply').innerHTML = reply; }, 320);
  }

  /* ======================= 需求映射 ======================= */
  function renderMapping() {
    const rows = D.mapping.map(r => `<tr>
      <td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td>
      <td class="${r[3].indexOf('P0') === 0 ? 'p0' : r[3].indexOf('P1') === 0 ? 'p1' : 'p2'}">${r[3]}</td>
    </tr>`).join('');
    $('#mappingTable').innerHTML =
      `<thead><tr><th style="width:96px">需求域</th><th style="width:44%">工单要点</th>
       <th>大屏展示模块 / 设计落点</th><th style="width:66px">优先级</th></tr></thead><tbody>${rows}</tbody>`;
  }

  /* ======================= 初始化 ======================= */
  function clock() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    $('#clockTime').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    $('#clockDate').textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${wk}`;
  }

  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    $('#stage').style.transform = `translate(-50%,-50%) scale(${s})`;
  }

  function bind() {
    document.querySelectorAll('#viewTabs button').forEach(b =>
      b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('#sceneTabs button').forEach(b =>
      b.addEventListener('click', () => setScene(b.dataset.scene)));

    document.querySelectorAll('#bookmarks .tb-btn').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#bookmarks .tb-btn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      STATE.bookmark = b.dataset.bm;
      moveTo(BM[b.dataset.bm]);
    }));

    document.querySelectorAll('#layers .layer-chip').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.layer;
      STATE.layers[k] = !STATE.layers[k];
      b.classList.toggle('on', STATE.layers[k]);
      applyMap();
    }));

    $('#btnAuto').addEventListener('click', () => {
      STATE.auto = !STATE.auto;
      $('#btnAuto').classList.toggle('on', STATE.auto);
      $('#btnAuto').textContent = '自动轮播 ' + (STATE.auto ? '开' : '关');
      toast(STATE.auto ? '自动轮播已开启（12s / 视图）' : '自动轮播已关闭');
    });

    $('#btnPause').addEventListener('click', () => {
      STATE.paused = !STATE.paused;
      $('#btnPause').classList.toggle('on', STATE.paused);
      $('#btnPause').textContent = STATE.paused ? '继续刷新' : '暂停刷新';
      toast(STATE.paused ? '已暂停实时数据推送（演示定格）' : '实时数据推送已恢复');
    });

    $('#btnMapping').addEventListener('click', () => {
      renderMapping();
      $('#mappingModal').classList.add('show');
    });
    $('#btnCloseMapping').addEventListener('click', () => $('#mappingModal').classList.remove('show'));
    $('#mappingModal').addEventListener('click', e => {
      if (e.target.id === 'mappingModal') $('#mappingModal').classList.remove('show');
    });

    $('#asPill').addEventListener('click', () => {
      const open = $('#asPanel').classList.toggle('show');
      if (open) ask('sortie');
    });
    document.querySelectorAll('[data-ask]').forEach(b =>
      b.addEventListener('click', () => ask(b.dataset.ask)));

    $('#kpis').addEventListener('click', e => {
      const card = e.target.closest('.kpi-card');
      if (!card) return;
      const k = card.dataset.kpi;
      if (k === 'airborne') {
        $('.as-panel') && $('#asPanel').classList.add('show');
        ask('fleet');
      } else if (k === 'online') {
        setView('device');
        toast('设备在线率下钻 · 设备管理屏');
      } else if (k === 'orders') {
        setView('logistics');
      } else if (k === 'sorties') {
        pulseKPI('sorties');
        toast('今日飞行架次 · 来源：飞行统计数据（模块 7.3.4）');
      } else if (k === 'safe') {
        toast('安全运行天数 · 自 2026-03-13 投运连续无事故');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') $('#mappingModal').classList.remove('show');
    });

    window.addEventListener('resize', fit);

    // 自动轮播
    setInterval(() => {
      if (!STATE.auto) return;
      const order = ['overview', 'device', 'logistics', 'safety'];
      const i = order.indexOf(STATE.view);
      setView(order[(i + 1) % order.length]);
    }, 12000);

    // 演示场景自动轮换（仅当未暂停时，每 45s 轮换一次以便汇报）
    let sceneIdx = 0;
    setInterval(() => {
      if (STATE.paused || !STATE.auto) return;
      sceneIdx = (sceneIdx + 1) % sceneOrder.length;
      setScene(sceneOrder[sceneIdx]);
    }, 45000);
  }

  function init() {
    const qs = new URLSearchParams(location.search);
    if (qs.get('view') && VIEWS[qs.get('view')]) STATE.view = qs.get('view');
    if (qs.get('scene') && D.scenes[qs.get('scene')]) STATE.scene = qs.get('scene');
    if (qs.get('intro') === '0') STATE.hideIntro = true;

    registerMaps();
    mapChart = echarts.init($('#mapChart'), null, { renderer: 'canvas' });
    mapChart.setOption(mapOption());
    mapChart.on('click', p => {
      if (p.componentType === 'series') onMapClick(p);
      else hideCard();
    });
    mapChart.on('georoam', () => {
      const g = mapChart.getOption().geo && mapChart.getOption().geo[0];
      if (g && g.center) STATE.geoCenter = g.center;
      if (g && g.zoom) STATE.geoZoom = g.zoom;
    });

    const s = D.scenes[STATE.scene];
    buildFleet(s.airborne, s.hot);
    paintTargets();
    renderView();
    renderTicker();
    clock();
    setInterval(clock, 1000);
    fit();
    bind();
    requestAnimationFrame(frame);
    if (new URLSearchParams(location.search).get('modal') === '1') {
      renderMapping();
      $('#mappingModal').classList.add('show');
    }
    if (new URLSearchParams(location.search).get('modal') === '1') {
      renderMapping();
      $('#mappingModal').classList.add('show');
    }

    // 开场态势摘要（演示：智能体主动播报，不依赖语音合成）
    setTimeout(() => { if (STATE.hideIntro) return;
      $('#asPanel').classList.add('show');
      $('#asReply').innerHTML = `指挥中心您好，当前空域内 <b>${s.airborne} 架</b>无人机执行任务，今日累计 <b>${s.sorties} 架次</b>，
        设备在线率 <b>${s.online}%</b>，安全运行 <b>236 天</b>。需重点关注：${D.alerts[STATE.scene][0].txt}。`;
      setTimeout(() => {
        if (!STATE.askTouched) { $('#asPanel').classList.remove('show'); }
      }, 9000);
    }, 1200);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
