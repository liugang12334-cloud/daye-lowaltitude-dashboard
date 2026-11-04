/* ==========================================================
   演示数据层（DEMO DATA）
   说明：所有数值为演示样例，结构与「数据底座-统一指标服务」接口字段对齐；
   场景切换时由 SCENES 覆盖，页面不做业务计算。
   ========================================================== */
window.DEMO = (function () {

  const palette = {
    cyan: '#2fe3ff', blue: '#4b9bff', amber: '#ffb020', red: '#ff4d61',
    green: '#35e08f', purple: '#a78bfa', pink: '#ff6b9a', trunk: '#8ff0ff'
  };

  /* ---------------- 起降场（二级枢纽 / 三级起降场） ---------------- */
  const pads = [
    { id: 'H1', name: '大冶北站综合枢纽', level: 2, lng: 114.945, lat: 30.118, charge: 7, chargeAll: 12, docks: 8, state: 'normal' },
    { id: 'H2', name: '铜绿山景区枢纽', level: 2, lng: 114.918, lat: 30.072, charge: 4, chargeAll: 8, docks: 6, state: 'normal' },
    { id: 'T1', name: '城东驿站', level: 3, lng: 115.012, lat: 30.108, charge: 2, chargeAll: 4, docks: 3, state: 'normal' },
    { id: 'T2', name: '陈贵镇站', level: 3, lng: 114.735, lat: 30.032, charge: 1, chargeAll: 2, docks: 2, state: 'warn' },
    { id: 'T3', name: '灵乡站', level: 3, lng: 114.668, lat: 29.995, charge: 0, chargeAll: 2, docks: 2, state: 'normal' },
    { id: 'T4', name: '保安镇站', level: 3, lng: 114.715, lat: 30.196, charge: 1, chargeAll: 2, docks: 2, state: 'normal' },
    { id: 'T5', name: '大箕铺站', level: 3, lng: 115.010, lat: 30.028, charge: 1, chargeAll: 4, docks: 3, state: 'normal' },
    { id: 'T6', name: '刘仁八站', level: 3, lng: 114.855, lat: 29.945, charge: 1, chargeAll: 2, docks: 2, state: 'normal' },
    { id: 'T7', name: '茗山站', level: 3, lng: 114.848, lat: 30.128, charge: 0, chargeAll: 2, docks: 2, state: 'normal' },
    { id: 'T8', name: '殷祖镇站', level: 3, lng: 114.900, lat: 29.925, charge: 1, chargeAll: 2, docks: 2, state: 'idle' }
  ];

  /* ---------------- 航线（干线 2 条 + 支线 7 条） ---------------- */
  const routes = [
    { id: 'G1', name: '北站枢纽 — 城东驿站', kind: 'trunk', a: 'H1', b: 'T1', km: 8.6, lvl: 120, bend: 0.16 },
    { id: 'G2', name: '北站枢纽 — 陈贵镇站', kind: 'trunk', a: 'H1', b: 'T2', km: 12.4, lvl: 150, bend: -0.18 },
    { id: 'B1', name: '城东驿站 — 大箕铺站', kind: 'commercial', a: 'T1', b: 'T5', km: 9.2, lvl: 120, bend: 0.12 },
    { id: 'B2', name: '北站枢纽 — 城东驿站(快线)', kind: 'commercial', a: 'H1', b: 'T1', km: 8.1, lvl: 90, bend: -0.13 },
    { id: 'M1', name: '北站枢纽 — 刘仁八站(医疗)', kind: 'medical', a: 'H1', b: 'T6', km: 21.6, lvl: 150, bend: 0.11 },
    { id: 'S1', name: '北站枢纽 — 铜绿山景区', kind: 'scenic', a: 'H1', b: 'H2', km: 6.8, lvl: 100, bend: -0.14 },
    { id: 'S2', name: '铜绿山枢纽 — 殷祖镇站', kind: 'scenic', a: 'H2', b: 'T8', km: 17.4, lvl: 130, bend: 0.12 },
    { id: 'I1', name: '陈贵镇站 — 灵乡站', kind: 'industrial', a: 'T2', b: 'T3', km: 10.8, lvl: 120, bend: 0.14 },
    { id: 'A1', name: '保安镇站 — 茗山站', kind: 'agri', a: 'T4', b: 'T7', km: 16.2, lvl: 110, bend: -0.15 }
  ];

  const kindColor = {
    trunk: palette.trunk, medical: palette.pink, commercial: palette.cyan,
    scenic: palette.amber, industrial: palette.purple, agri: palette.green
  };
  const kindName = {
    trunk: '干线航路', medical: '医疗转运', commercial: '商业配送',
    scenic: '景区接驳', industrial: '工业急件', agri: '农产品外运'
  };

  /* ---------------- 空域网格（禁飞 / 限飞 / 适飞） ---------------- */
  const zones = [
    { name: '适飞·陈贵—灵乡片区', kind: 'ok', lng: 114.700, lat: 30.014, r: 4.6 },
    { name: '适飞·刘仁八片区', kind: 'ok', lng: 114.855, lat: 29.945, r: 3.6 },
    { name: '适飞·保安片区', kind: 'ok', lng: 114.715, lat: 30.196, r: 3.6 },
    { name: '限飞·中心城区', kind: 'limit', lng: 114.985, lat: 30.098, r: 4.2 },
    { name: '限飞·铜绿山景区', kind: 'limit', lng: 114.918, lat: 30.072, r: 2.2 },
    { name: '禁飞·大冶北站净空保护区', kind: 'nofly', lng: 114.945, lat: 30.118, r: 1.6 },
    { name: '禁飞·市政务核心区', kind: 'nofly', lng: 114.976, lat: 30.101, r: 0.9 }
  ];

  const zoneStyle = {
    nofly: { line: '#ff4d61', fill: 'rgba(255,77,97,.20)' },
    limit: { line: '#ffb020', fill: 'rgba(255,176,32,.15)' },
    ok: { line: '#35e08f', fill: 'rgba(53,224,143,.10)' }
  };

  /* ---------------- 乡镇街道标注（演示近似位置） ---------------- */
  const towns = [
    { name: '大冶城区', lng: 114.9748, lat: 30.0988, main: true },
    { name: '保安镇', lng: 114.700, lat: 30.200 },
    { name: '还地桥镇', lng: 114.800, lat: 30.240 },
    { name: '陈贵镇', lng: 114.720, lat: 30.030 },
    { name: '灵乡镇', lng: 114.660, lat: 29.990 },
    { name: '刘仁八镇', lng: 114.850, lat: 29.940 },
    { name: '大箕铺镇', lng: 115.020, lat: 30.030 },
    { name: '殷祖镇', lng: 114.900, lat: 29.920 },
    { name: '茗山乡', lng: 114.850, lat: 30.130 }
  ];

  /* ---------------- 演示场景 ---------------- */
  const scenes = {
    normal: {
      key: 'normal', name: '常态运行', hot: 'commercial',
      sorties: 386, sortiePrev: 343, delta: 12.4, airborne: 12,
      online: 94.6, order: 1284, orderDelta: 8.6, revenue: 86420, revDelta: 6.4,
      fleet: { fly: 12, idle: 41, off: 9, maint: 6 },
      airspace: { apply: 18, approved: 14, pending: 3, reject: 1 },
      sceneShare: [
        { name: '商业配送', value: 436 }, { name: '景区接驳', value: 282 },
        { name: '医疗转运', value: 231 }, { name: '工业急件', value: 205 },
        { name: '农产品外运', value: 130 }
      ],
      notice: '临时通告：11-05 09:00-12:00 铜绿山景区上空限飞（市级平台同步）',
      events: [
        { lng: 114.992, lat: 30.104, lv: 1, name: 'UAV-0237 低电量告警', mode: 'alert' },
        { lng: 114.735, lat: 30.032, lv: 2, name: '起降场 T2 机巢舱门异常', mode: 'alert' },
        { lng: 115.010, lat: 30.030, lv: 3, name: 'UAV-0092 偏离计划航线', mode: 'alert' }
      ]
    },
    peak: {
      key: 'peak', name: '早高峰配送', hot: 'commercial',
      sorties: 498, sortiePrev: 386, delta: 29.1, airborne: 21,
      online: 92.4, order: 1866, orderDelta: 22.7, revenue: 124800, revDelta: 18.2,
      fleet: { fly: 21, idle: 33, off: 8, maint: 6 },
      airspace: { apply: 26, approved: 21, pending: 4, reject: 1 },
      sceneShare: [
        { name: '商业配送', value: 762 }, { name: '景区接驳', value: 318 },
        { name: '医疗转运', value: 268 }, { name: '工业急件', value: 336 },
        { name: '农产品外运', value: 182 }
      ],
      notice: '运力提示：城东驿站 — 大箕铺站 支线 08:00-10:00 时段架次已近上限',
      events: [
        { lng: 115.008, lat: 30.100, lv: 1, name: '城东驿站 机位饱和预警', mode: 'alert' },
        { lng: 114.996, lat: 30.096, lv: 2, name: 'UAV-0114 图传链路丢包 18%', mode: 'alert' },
        { lng: 114.780, lat: 30.060, lv: 3, name: 'UAV-0305 接近限飞区边界', mode: 'alert' }
      ]
    },
    medical: {
      key: 'medical', name: '医疗急救', hot: 'medical',
      sorties: 412, sortiePrev: 358, delta: 15.1, airborne: 15,
      online: 95.4, order: 1320, orderDelta: 11.3, revenue: 91200, revDelta: 9.8,
      fleet: { fly: 15, idle: 38, off: 9, maint: 6 },
      airspace: { apply: 21, approved: 18, pending: 2, reject: 1 },
      sceneShare: [
        { name: '医疗转运', value: 398 }, { name: '商业配送', value: 386 },
        { name: '景区接驳', value: 242 }, { name: '工业急件', value: 186 },
        { name: '农产品外运', value: 108 }
      ],
      notice: '急救任务：北站枢纽 — 刘仁八站 血液样本转运，通道已优先放行',
      events: [
        { lng: 114.900, lat: 30.030, lv: 1, name: '急救转运任务 已起飞（优先通道）', mode: 'alert' },
        { lng: 114.855, lat: 29.945, lv: 2, name: '刘仁八站 接收端待命确认', mode: 'alert' },
        { lng: 114.945, lat: 30.118, lv: 3, name: 'UAV-0412 高度层调整至 150m', mode: 'alert' }
      ]
    },
    emergency: {
      key: 'emergency', name: '应急处置', hot: 'emergency',
      sorties: 441, sortiePrev: 372, delta: 18.5, airborne: 18,
      online: 89.7, order: 1398, orderDelta: 9.1, revenue: 95800, revDelta: 4.2,
      fleet: { fly: 18, idle: 32, off: 12, maint: 6 },
      airspace: { apply: 24, approved: 15, pending: 6, reject: 3 },
      sceneShare: [
        { name: '商业配送', value: 402 }, { name: '医疗转运', value: 356 },
        { name: '景区接驳', value: 208 }, { name: '工业急件', value: 226 },
        { name: '农产品外运', value: 206 }
      ],
      notice: '应急处置：中心城区 14:20 起临时禁飞，3 条航线已自动改航',
      events: [
        { lng: 114.985, lat: 30.098, lv: 1, name: '临时禁飞区已生效（中心城区）', mode: 'zone' },
        { lng: 114.960, lat: 30.110, lv: 1, name: '非合作目标 探测告警', mode: 'alert' },
        { lng: 114.930, lat: 30.088, lv: 2, name: '3 条航线自动改航执行中', mode: 'alert' },
        { lng: 114.720, lat: 30.030, lv: 3, name: '陈贵镇站 备用机巢启用', mode: 'alert' }
      ]
    }
  };

  /* ---------------- 告警（最近 5 条） ---------------- */
  const alerts = {
    normal: [
      { lv: 1, t: '14:32:05', txt: 'UAV-0237 电池电量低于 20%，建议就近降落' },
      { lv: 2, t: '14:29:41', txt: 'UAV-0114 图传链路丢包率 18%' },
      { lv: 2, t: '14:21:12', txt: '起降场 T2 机巢舱门状态异常' },
      { lv: 3, t: '14:12:58', txt: 'UAV-0092 偏离计划航线 120m' },
      { lv: 3, t: '14:05:33', txt: 'UAV-0305 接近限飞区边界' }
    ],
    peak: [
      { lv: 1, t: '14:41:22', txt: '城东驿站机位饱和（8/8），待降 3 架' },
      { lv: 1, t: '14:38:07', txt: 'UAV-0114 图传链路丢包率 18%' },
      { lv: 2, t: '14:31:45', txt: 'UAV-0321 电池温度 62℃ 偏高' },
      { lv: 2, t: '14:24:10', txt: '支线 B1 时段架次已达上限 96%' },
      { lv: 3, t: '14:16:52', txt: 'UAV-0198 等待起飞超时 4 分钟' }
    ],
    medical: [
      { lv: 1, t: '14:44:03', txt: '急救任务 DY-EM-072 已起飞，优先通道放行' },
      { lv: 1, t: '14:39:36', txt: 'UAV-0412 电量 34%，任务后需回巢' },
      { lv: 2, t: '14:28:19', txt: '刘仁八站 接收端待命确认超时' },
      { lv: 3, t: '14:18:44', txt: '航线 M1 高度层由 150m 调整至 120m' },
      { lv: 3, t: '14:06:28', txt: 'UAV-0237 已完成转运任务归档' }
    ],
    emergency: [
      { lv: 1, t: '14:20:00', txt: '中心城区临时禁飞区生效，3 条航线改航' },
      { lv: 1, t: '14:21:37', txt: '非合作目标探测：方位 078°，高度 210m' },
      { lv: 1, t: '14:23:55', txt: '设备在线率跌破 90% 阈值（89.7%）' },
      { lv: 2, t: '14:26:12', txt: '陈贵镇站 备用机巢启用' },
      { lv: 2, t: '14:30:41', txt: '告警处置工单已派发至值班人员' }
    ]
  };

  /* ---------------- 底部运单滚动 ---------------- */
  const orders = [
    { no: 'DY2611040086', goods: '血液样本', from: '北站枢纽', to: '刘仁八站', state: '飞行中' },
    { no: 'DY2611040085', goods: '精密模具', from: '陈贵镇站', to: '灵乡站', state: '已起飞' },
    { no: 'DY2611040084', goods: '景区文创', from: '铜绿山枢纽', to: '殷祖镇站', state: '派送中' },
    { no: 'DY2611040083', goods: '生鲜农品', from: '保安镇站', to: '茗山站', state: '已签收' },
    { no: 'DY2611040082', goods: '电商快件', from: '城东驿站', to: '大箕铺站', state: '飞行中' },
    { no: 'DY2611040081', goods: '医疗耗材', from: '北站枢纽', to: '城东驿站', state: '已签收' }
  ];

  const links = [
    { name: '市级空域管理平台', state: '已连接', sync: '12,486 条', api: '3,214 次' },
    { name: '省级低空平台', state: '待接通', sync: '—', api: '—' },
    { name: '时序数据库', state: '正常', sync: '1.2 万点/s', api: '1Hz' },
    { name: '物流运营平台', state: '已连接', sync: '1,284 单', api: '486 次' }
  ];

  /* ---------------- 需求映射表 ---------------- */
  const mapping = [
    ['大屏框架', '§7.1 五区布局：顶部标题+KPI带、中央主视区约55%、左右竖栏、底部滚动区', '整屏骨架（1920×1080 等比缩放）；左右各 3 个面板', 'P0'],
    ['顶部标题栏', '§7.2 系统标题与秒级运行时间、数据链路状态灯', '标题栏：主标题+横幅；右上时钟；左侧三枚链路状态灯', 'P0'],
    ['KPI 指标带', '§7.2 今日飞行架次（含较昨日同期增减）', 'KPI-1 大数字 + ▲12.4% 箭头 + 昨日基数', 'P0'],
    ['KPI 指标带', '§7.2 在飞目标数（点击地图高亮在飞目标）', 'KPI-2 实时刷新；点击触发地图目标高亮脉冲', 'P0'],
    ['KPI 指标带', '§7.2 设备在线率（低于阈值转黄，点击下钻）', 'KPI-3 阈值 90%，低于转黄并弹层下钻', 'P0'],
    ['KPI 指标带', '§7.2 安全运行天数', 'KPI-4 累计天数 + 起算日期说明', 'P1'],
    ['KPI 指标带', '全量§7.2 今日订单量 / 今日营收', 'KPI-5、KPI-6（物流运营屏启用）', 'P1/P2'],
    ['GIS 一张图', '§7.3 底图层：市域/乡镇街道边界、地名标注', '暗色底图 + 市域发光描边 + 9 个乡镇标注', 'P0'],
    ['GIS 一张图', '§7.3 空域网格层：禁飞红/限飞橙/适飞绿，临时通告闪烁', '三色半透明面 + 悬停管控属性；应急场景临时禁飞闪烁', 'P1'],
    ['GIS 一张图', '§7.3 航线层：干线发光双线+高度层，支线四类分色', '9 条航线：2 干线（双层描边）+7 支线（四类配色）+流光动效', 'P0'],
    ['GIS 一张图', '§7.3 起降场层：二级枢纽大图标+充电桩占用/机位，三态', '10 个起降场：枢纽/驿站两档图标，三态着色，悬停明细', 'P0'],
    ['GIS 一张图', '§7.3 实时目标层：动态图标+呼号/高度/速度+渐隐尾迹', '12–21 架无人机沿线飞行，秒级位置刷新，点击弹出详情卡', 'P0'],
    ['GIS 一张图', '§7.3 事件图层：分级闪烁并置顶高级别事件', '事件涟漪图标（红/橙/蓝），与左栏告警列表联动', 'P0'],
    ['GIS 一张图', '§7.3 地图交互与书签视图', '滚轮缩放/拖拽 + 全域总览、城区放大、干线航路三书签', 'P0'],
    ['左栏面板', '§7.4 无人机设备状态面板：环形图四态分布', '环形图（飞行中/空闲待命/离线/维保中）+ 右侧数值图例', 'P0'],
    ['左栏面板', '§7.4 设备告警列表面板：最近五条，高级别置顶闪烁', '5 条告警列表，Ⅰ/Ⅱ/Ⅲ 级色标，Ⅰ级呼吸闪烁', 'P0'],
    ['底部滚动区', '§7.5 告警事件滚动 / 电子运单滚动 / 平台对接状态', '三段式跑马灯：告警、运单、省市平台同步量与调用量', 'P1'],
    ['物流运营屏', '全量§7.6 订单趋势、场景占比、配送时效、驿站排名、经营指标', '独立主题屏：折线 / 玫瑰图 / 半环仪表 / 横向排行 / 收入结构', 'P2'],
    ['设备管理屏', '全量§7.7 设备 GIS 分布、台账导航、健康分析、告警全量', '主题屏：设备分层统计、单机参数卡、7 日在线率、维保提醒', 'P1'],
    ['安全监管屏', '全量§7.8 感知态势、违规分析、处置闭环、事件时间线', '主题屏：识别率对标、违规类型分布、四阶段漏斗、时间轴', 'P2'],
    ['数据机制', '§7.9 统一取数 + 三级刷新（秒级 / 30s–1min / 5–15min）', '全屏由统一指标服务驱动；演示中 1s 推送、30s 指标刷新', 'P0'],
    ['智能体', '§7.10 语音问数、语音控屏（放大/定位）、盯防播报', '悬浮助手：问数回填 + KPI 高亮；"放大城区"驱动地图书签', 'P0'],
    ['智能体', '§7.11 开场态势摘要（≤30 秒口语化简报）', '助手开场播报模板（演示文案）', 'P1'],
    ['演示逻辑', '一主三专页面体系 + 业务场景演示', '4 视图切换 + 4 场景切换 + 12s 自动轮播', 'P1']
  ];

  return { palette, pads, routes, kindColor, kindName, zones, zoneStyle, towns, scenes, alerts, orders, links, mapping };
})();
