/* 密醫報告 wiki 互動功能
 * - [[雙鏈]] 轉成網站連結
 * - YAML 資訊轉成卡片資訊框
 * - 名詞小辭典 → 滑鼠移上去（手機點一下）顯示白話解釋
 * - 首頁儀表板：倒數、進度、查證統計
 * - 關係圖、卡片總表
 */
(function () {
  'use strict';

  // ===== 截止日（要改日期改這裡）=====
  var DEADLINES = [
    { label: '初稿 3,000 字', date: '2026-11-26' },
    { label: '初審（完善＋簡報）', date: null },  // 知道日期後填入，例如 '2026-12-17'
    { label: '結稿 5,000 字', date: '2027-01-15' }
  ];

  var FOLDER_COLORS = {
    '爭點': '#d1495b', '法條': '#1f6f78', '判決': '#edae49',
    '文獻': '#00798c', '草稿': '#8d6cab', '模板': '#aaaaaa', '': '#30638e'
  };

  var INDEX = { pages: [] };
  var BY_NAME = {};
  var GLOSSARY = [];   // [{term, tip}]

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; });
  }

  // ---------- 載入資料 ----------
  function loadIndex() {
    return getText('wiki-index.json').then(function (t) {
      try { INDEX = JSON.parse(t); } catch (e) { INDEX = { pages: [] }; }
      INDEX.pages.forEach(function (p) { BY_NAME[p.name] = p; });
    });
  }
  function loadGlossary() {
    return getText('名詞小辭典.md').then(function (md) {
      md.split('\n').forEach(function (line) {
        var m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
        if (!m || /^[-:\s]+$/.test(m[1]) || m[1] === '名詞') return;
        m[1].split('／').forEach(function (t) {
          t = t.trim();
          if (t.length >= 2) GLOSSARY.push({ term: t, tip: m[2] });
        });
      });
      GLOSSARY.sort(function (a, b) { return b.term.length - a.term.length; });
    });
  }

  // ---------- Markdown 前處理 ----------
  function metaBox(meta) {
    var keys = Object.keys(meta);
    if (!keys.length) return '';
    var status = meta['查證'] || '';
    var cls = status.indexOf('✅') === 0 ? 'ok' : status.indexOf('⚠️') === 0 ? 'warn' : status ? 'todo' : '';
    var rows = keys.filter(function (k) { return k !== '查證' && k !== '爭點'; }).map(function (k) {
      return '<div class="meta-row"><span class="meta-key">' + esc(k) + '</span><span>' + esc(meta[k]) + '</span></div>';
    }).join('');
    var issues = (meta['爭點'] || '').replace(/[\[\]\s]/g, '').split(',').filter(Boolean).map(function (n) {
      var pg = INDEX.pages.filter(function (p) { return p.name.indexOf('爭點' + n + '_') === 0; })[0];
      return pg ? '<a class="chip issue-' + n + '" href="#/' + pg.path + '">爭點' + n + '</a>'
                : '<span class="chip">爭點' + n + '</span>';
    }).join(' ');
    return '<div class="meta-box ' + cls + '">' +
      (status ? '<div class="meta-status">' + esc(status) + '</div>' : '') +
      (issues ? '<div class="meta-issues">' + issues + '</div>' : '') + rows + '</div>\n\n';
  }

  function preprocess(md) {
    var meta = {};
    md = md.replace(/^---\s*\n([\s\S]*?)\n---\s*\n/, function (_, block) {
      block.split('\n').forEach(function (line) {
        var i = line.indexOf(':');
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      return '';
    });
    // 先保護程式碼區塊，避免 `[[範例]]` 被轉換
    var codes = [];
    md = md.replace(/```[\s\S]*?```|`[^`\n]+`/g, function (m) { codes.push(m); return '\u0000' + (codes.length - 1) + '\u0000'; });
    md = md.replace(/\[\[([^\]|#]+)(?:[#|]([^\]]*))?\]\]/g, function (_, name, alias) {
      name = name.trim();
      var label = (alias || name).trim();
      var pg = BY_NAME[name];
      return pg ? '<a class="wikilink" href="#/' + pg.path + '">' + esc(label) + '</a>'
                : '<span class="wikilink broken" title="尚未建立的卡片">' + esc(label) + '</span>';
    });
    md = md.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
    // 把 meta 框放在第一個標題後面
    var box = metaBox(meta);
    if (box) {
      var h = md.match(/^#\s+.+$/m);
      md = h ? md.replace(h[0], h[0] + '\n\n' + box) : box + md;
    }
    return md;
  }

  // ---------- 名詞提示 ----------
  function addTooltips(root) {
    if (!GLOSSARY.length || location.hash.indexOf('名詞小辭典') >= 0) return;
    var skip = /^(A|CODE|PRE|H1|H2|ABBR|SCRIPT|STYLE|SVG|TEXT|BUTTON|SELECT|OPTION)$/;
    function okNode(n) {
      for (var p = n.parentNode; p && p !== root; p = p.parentNode) {
        if (skip.test(p.nodeName) || (p.classList && (p.classList.contains('meta-box') ||
            p.classList.contains('no-tip')))) return false;
      }
      return true;
    }
    GLOSSARY.forEach(function (g) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) {
        var idx = node.nodeValue.indexOf(g.term);
        if (idx < 0 || !okNode(node)) continue;
        var after = node.splitText(idx);
        after.splitText(g.term.length);
        var abbr = document.createElement('abbr');
        abbr.className = 'term';
        abbr.setAttribute('data-tip', g.tip);
        abbr.setAttribute('tabindex', '0');
        abbr.textContent = g.term;
        after.parentNode.replaceChild(abbr, after);
        break; // 每頁每個詞只標第一次
      }
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('abbr.term');
    document.querySelectorAll('abbr.term.open').forEach(function (a) { if (a !== t) a.classList.remove('open'); });
    if (t) t.classList.toggle('open');
  });

  // ---------- 首頁儀表板 ----------
  function daysLeft(dateStr) {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var d = new Date(dateStr + 'T00:00:00');
    return Math.round((d - now) / 86400000);
  }
  function renderDashboard(section) {
    getText('進度.md').then(function (md) {
      var done = (md.match(/^\s*- \[x\]/gim) || []).length;
      var todo = (md.match(/^\s*- \[ \]/gm) || []).length;
      var pct = done + todo ? Math.round(done / (done + todo) * 100) : 0;
      var stageM = md.match(/^##\s*目前階段[：:]\s*(.+)$/m);
      var stage = stageM ? stageM[1] : '';
      var cards = INDEX.pages.filter(function (p) { return /^(法條|判決|文獻)$/.test(p.folder); });
      var ok = cards.filter(function (p) { return p.status === '✅'; }).length;
      var warn = cards.filter(function (p) { return p.status === '⚠️'; }).length;

      var dl = DEADLINES.map(function (d) {
        if (!d.date) return '<div class="dl-item pending"><div class="dl-num">？</div><div>' + esc(d.label) + '<br><small>日期待填</small></div></div>';
        var n = daysLeft(d.date);
        var cls = n < 0 ? 'past' : n <= 3 ? 'urgent' : '';
        var txt = n < 0 ? '已過' : n === 0 ? '今天' : n + '天';
        return '<div class="dl-item ' + cls + '"><div class="dl-num">' + txt + '</div><div>' + esc(d.label) +
          '<br><small>' + d.date.slice(5).replace('-', '/') + '</small></div></div>';
      }).join('');

      var html = '<div id="dashboard" class="no-tip">' +
        '<div class="dash-stage">目前階段：<strong>' + esc(stage) + '</strong></div>' +
        '<div class="dl-row">' + dl + '</div>' +
        '<div class="dash-grid">' +
          '<a class="dash-card" href="#/進度"><div class="dash-label">待辦完成度</div>' +
            '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
            '<div class="dash-num">' + done + ' / ' + (done + todo) + '（' + pct + '%）</div></a>' +
          '<a class="dash-card" href="#/卡片總表"><div class="dash-label">資料卡查證</div>' +
            '<div class="bar split"><span class="ok" style="width:' + (cards.length ? ok / cards.length * 100 : 0) + '%"></span>' +
            '<span class="warn" style="width:' + (cards.length ? warn / cards.length * 100 : 0) + '%"></span></div>' +
            '<div class="dash-num">✅ ' + ok + '　⚠️ ' + warn + '　共 ' + cards.length + ' 張</div></a>' +
          '<a class="dash-card" href="#/graph"><div class="dash-label">關係圖</div>' +
            '<div class="dash-big">🕸️</div><div class="dash-num">看卡片怎麼互相連結</div></a>' +
        '</div></div>';
      var h1 = section.querySelector('h1');
      if (h1) h1.insertAdjacentHTML('afterend', html); else section.insertAdjacentHTML('afterbegin', html);
    });
  }

  // ---------- 卡片總表 ----------
  function renderCards(el) {
    var pages = INDEX.pages.filter(function (p) { return /^(法條|判決|文獻|爭點)$/.test(p.folder); });
    var folders = ['全部', '法條', '判決', '文獻', '爭點'];
    el.innerHTML =
      '<div class="filters no-tip">' +
        '<label>類型 <select id="f-folder">' + folders.map(function (f) { return '<option>' + f + '</option>'; }).join('') + '</select></label>' +
        '<label>爭點 <select id="f-issue"><option value="">全部</option><option>1</option><option>2</option><option>3</option></select></label>' +
        '<label>查證 <select id="f-status"><option value="">全部</option><option>✅</option><option>⚠️</option><option>❓</option></select></label>' +
        '<span id="f-count"></span>' +
      '</div><table class="cards-table no-tip"><thead><tr><th>卡片</th><th>類型</th><th>爭點</th><th>查證</th><th>被引用</th></tr></thead><tbody></tbody></table>';
    var backlinks = {};
    INDEX.pages.forEach(function (p) { p.links.forEach(function (l) { backlinks[l] = (backlinks[l] || 0) + 1; }); });
    function draw() {
      var f = el.querySelector('#f-folder').value, i = el.querySelector('#f-issue').value, s = el.querySelector('#f-status').value;
      var rows = pages.filter(function (p) {
        return (f === '全部' || p.folder === f) && (!i || p.issues.indexOf(i) >= 0) && (!s || p.status === s);
      });
      el.querySelector('tbody').innerHTML = rows.map(function (p) {
        return '<tr><td><a href="#/' + p.path + '">' + esc(p.name) + '</a></td><td><span class="dot" style="background:' +
          (FOLDER_COLORS[p.folder] || '#999') + '"></span>' + esc(p.folder) + '</td><td>' +
          p.issues.map(function (n) { return '<span class="chip issue-' + n + '">' + n + '</span>'; }).join(' ') +
          '</td><td>' + (p.status || '—') + '</td><td>' + (backlinks[p.name] || 0) + '</td></tr>';
      }).join('') || '<tr><td colspan="5">沒有符合條件的卡片</td></tr>';
      el.querySelector('#f-count').textContent = '共 ' + rows.length + ' 張';
    }
    el.querySelectorAll('select').forEach(function (s) { s.addEventListener('change', draw); });
    draw();
  }

  // ---------- 關係圖 ----------
  function renderGraph(el) {
    if (!window.d3) { el.textContent = '關係圖元件載入失敗'; return; }
    var pages = INDEX.pages.filter(function (p) {
      return /^(爭點|法條|判決|文獻)$/.test(p.folder);
    });
    var names = {}; pages.forEach(function (p) { names[p.name] = true; });
    var links = [];
    pages.forEach(function (p) {
      p.links.forEach(function (t) { if (names[t] && t !== p.name) links.push({ source: p.name, target: t }); });
    });
    var nodes = pages.map(function (p) {
      var deg = links.filter(function (l) { return l.source === p.name || l.target === p.name; }).length;
      return { id: p.name, path: p.path, folder: p.folder, issues: p.issues, status: p.status, r: 6 + Math.sqrt(deg) * 2.5 };
    });

    el.innerHTML = '<div class="graph-controls no-tip">' +
      ['全部', '爭點1', '爭點2', '爭點3'].map(function (b, i) {
        return '<button data-issue="' + (i || '') + '" class="' + (i ? '' : 'active') + '">' + b + '</button>';
      }).join('') +
      '<span class="legend">' + ['爭點', '法條', '判決', '文獻'].map(function (f) {
        return '<span><span class="dot" style="background:' + FOLDER_COLORS[f] + '"></span>' + f + '</span>';
      }).join('') + '</span></div><div class="graph-box"></div>';

    var box = el.querySelector('.graph-box');
    var W = box.clientWidth || 800, H = Math.max(480, Math.min(700, window.innerHeight - 220));
    var svg = d3.select(box).append('svg').attr('viewBox', [0, 0, W, H]).attr('width', '100%').attr('height', H);
    var g = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', function (e) { g.attr('transform', e.transform); }));

    var sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(110).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-700))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("x", d3.forceX(W / 2).strength(0.04)).force("y", d3.forceY(H / 2).strength(0.06))
      .force('collide', d3.forceCollide().radius(function (d) { return d.r + 18; }));

    var link = g.append('g').attr('class', 'g-links').selectAll('line').data(links).join('line');
    var node = g.append('g').selectAll('g').data(nodes).join('g').attr('class', 'g-node')
      .call(d3.drag()
        .on('start', function (e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', function (e, d) { d.fx = e.x; d.fy = e.y; })
        .on('end', function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on('click', function (e, d) { location.hash = '#/' + d.path; });
    node.append('circle').attr('r', function (d) { return d.r; })
      .attr('fill', function (d) { return FOLDER_COLORS[d.folder] || '#30638e'; })
      .attr('stroke', function (d) { return d.status === '⚠️' ? '#f0a202' : d.status === '✅' ? '#2a9d8f' : '#fff'; });
    node.append('text').attr('dy', function (d) { return d.r + 13; }).attr('text-anchor', 'middle')
      .text(function (d) { return d.id.split('_')[0].length > 14 ? d.id.split('_')[0].slice(0, 13) + '…' : d.id.split('_')[0]; });
    node.append('title').text(function (d) { return d.id + (d.status ? '（' + d.status + '）' : ''); });

    sim.on('tick', function () {
      link.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
          .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
      node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    });

    el.querySelectorAll('.graph-controls button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        el.querySelectorAll('.graph-controls button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var n = btn.getAttribute('data-issue');
        var on = function (d) { return !n || d.issues.indexOf(n) >= 0 || d.id.indexOf('爭點' + n + '_') === 0; };
        node.classed('dim', function (d) { return !on(d); });
        link.classed('dim', function (l) { return !(on(l.source) && on(l.target)); });
      });
    });
  }

  // ---------- docsify 外掛 ----------
  function wikiPlugin(hook) {
    hook.beforeEach(preprocess);
    hook.doneEach(function () {
      var section = document.querySelector('.markdown-section');
      if (!section) return;
      var path = decodeURIComponent(location.hash.replace(/^#\/?/, '').split('?')[0]);
      if (path === '' || path === '00_總覽') renderDashboard(section);
      var ga = document.getElementById('graph-app'); if (ga) renderGraph(ga);
      var ca = document.getElementById('cards-app'); if (ca) renderCards(ca);
      addTooltips(section);
    });
  }

  // ---------- 啟動 ----------
  Promise.all([loadIndex(), loadGlossary()]).then(function () {
    window.$docsify.plugins = [wikiPlugin].concat(window.$docsify.plugins || []);
    ['assets/vendor/search.min.js', 'assets/vendor/docsify.min.js'].reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (res) {
          var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = res;
          document.body.appendChild(s);
        });
      });
    }, Promise.resolve());
  });
})();
