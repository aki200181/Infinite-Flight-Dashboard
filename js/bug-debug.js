// =============================== BUG DEBUG (TEMPORARY) ===============================
// PLAN.md フェーズL「iPad での Flight Log 拡大画面 タッチ不具合」調査用。
// 原因特定 → 修正完了後に削除予定。
//
// 有効化方法：
//   - URL に `?debug=1` を付ける（例：https://your.site/?debug=1）
//   - または localStorage で `localStorage.setItem('debug','1')`（次回以降ずっと有効）
//   - 画面下部にログパネルが出る。off ボタンで停止＋localStorage 削除。
//
// ログ内容：
//   - touchstart / touchend / pointerdown / pointerup / click（全てキャプチャフェーズで取得）
//   - .table-wrap 内のスクロール
//   - 主要関数の呼び出し（toggleFlightLogFullscreen / confirmDeleteOne / closeConfirm / executeDelete）

(function(){
  'use strict';

  // -------- 有効化チェック --------
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('debug') === '1';
  const fromStorage = (function(){
    try { return localStorage.getItem('debug') === '1'; } catch(_) { return false; }
  })();
  if (!fromUrl && !fromStorage) return;
  // ?debug=1 でアクセスしたら localStorage に保存（次回以降も自動有効）
  if (fromUrl) {
    try { localStorage.setItem('debug', '1'); } catch(_) {}
  }

  // -------- DOM 作成 --------
  const panel = document.createElement('div');
  panel.id = '__bug_debug_panel';
  panel.style.cssText = [
    'position:fixed','left:0','right:0','bottom:0',
    'max-height:35vh','overflow-y:auto',
    'background:rgba(0,0,0,0.88)','color:#0f0',
    'font:11px/1.35 ui-monospace,Menlo,monospace',
    'padding:6px 8px','z-index:99999',
    'border-top:2px solid #0f0',
    'pointer-events:auto',
    'touch-action:pan-y' // パネル内スクロールを iOS で許可
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;gap:6px;align-items:center;border-bottom:1px solid #0f0;padding-bottom:4px;margin-bottom:4px;flex-wrap:wrap;';
  const btnStyle = 'background:#222;color:#0f0;border:1px solid #0f0;padding:3px 9px;font:11px ui-monospace,Menlo,monospace;cursor:pointer;border-radius:3px;';
  header.innerHTML =
    '<strong style="color:#0f0;">DEBUG</strong>' +
    '<button id="__dbg_clear" style="'+btnStyle+'">clear</button>' +
    '<button id="__dbg_hide"  style="'+btnStyle+'">hide</button>' +
    '<button id="__dbg_off"   style="'+btnStyle.replace(/#0f0/g,'#f55')+'">off</button>' +
    '<span id="__dbg_count" style="margin-left:auto;color:#aaa;">0 events</span>';
  panel.appendChild(header);

  const logEl = document.createElement('div');
  logEl.id = '__dbg_log';
  panel.appendChild(logEl);

  // パネル非表示時に出すフローティング復帰ボタン
  const showBtn = document.createElement('button');
  showBtn.id = '__bug_debug_show';
  showBtn.textContent = '🐞';
  showBtn.style.cssText = [
    'position:fixed','right:10px','bottom:10px',
    'width:48px','height:48px','border-radius:50%',
    'background:#0f0','color:#000','border:none',
    'font-size:22px','z-index:99999','cursor:pointer',
    'display:none','box-shadow:0 4px 12px rgba(0,0,0,0.5)'
  ].join(';');

  // -------- ログ機構 --------
  const startTime = Date.now();
  let count = 0;

  function updateCount(){
    const el = document.getElementById('__dbg_count');
    if (el) el.textContent = count + ' events';
  }

  function pad(s, n){ s = String(s); while (s.length < n) s = ' ' + s; return s; }

  function logEvent(text, color){
    count++;
    const t = ((Date.now() - startTime) / 1000).toFixed(3);
    const row = document.createElement('div');
    row.style.cssText = 'border-bottom:1px solid #033;white-space:pre-wrap;word-break:break-all;';
    if (color) row.style.color = color;
    row.textContent = pad(t, 8) + ' ' + text;
    logEl.appendChild(row);
    // 最新を自動でビュー内に
    panel.scrollTop = panel.scrollHeight;
    // 古いものを捨てる（メモリ抑制）
    while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
    updateCount();
  }

  function describeTarget(el){
    if (!el || !el.tagName) return '?';
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/).slice(0, 3).join('.');
      if (cls) s += '.' + cls;
    }
    return s;
  }

  function eventColor(type){
    if (type === 'click') return '#0ff';
    if (type === 'touchstart' || type === 'touchend') return '#fa0';
    if (type === 'pointerdown' || type === 'pointerup') return '#aaa';
    return '#888';
  }

  // -------- 主要関数のラップ --------
  function wrapFunction(name, argsFormatter){
    const orig = window[name];
    if (typeof orig !== 'function') {
      logEvent('!! cannot wrap ' + name + ' (not a function)', '#f55');
      return;
    }
    window[name] = function(){
      let argStr = '';
      try { argStr = argsFormatter ? argsFormatter.apply(null, arguments) : ''; } catch(_) {}
      logEvent('>> ' + name + '(' + argStr + ')', '#ff0');
      return orig.apply(this, arguments);
    };
  }

  // -------- イベントリスナー --------
  function attachListeners(){
    ['touchstart','touchend','pointerdown','pointerup','click'].forEach(function(type){
      document.addEventListener(type, function(e){
        const t = e.target;
        // デバッグパネル自身は無視
        if (panel.contains(t) || showBtn.contains(t)) return;
        let coord = '';
        if (e.touches && e.touches[0]) {
          coord = ' @' + Math.round(e.touches[0].clientX) + ',' + Math.round(e.touches[0].clientY);
        } else if (e.changedTouches && e.changedTouches[0]) {
          coord = ' @' + Math.round(e.changedTouches[0].clientX) + ',' + Math.round(e.changedTouches[0].clientY);
        } else if (typeof e.clientX === 'number') {
          coord = ' @' + Math.round(e.clientX) + ',' + Math.round(e.clientY);
        }
        logEvent(pad(type, 12) + ' ' + describeTarget(t) + coord, eventColor(type));
      }, true); // capture phase
    });

    // .table-wrap のスクロール
    document.addEventListener('scroll', function(e){
      const t = e.target;
      if (t && t.classList && t.classList.contains('table-wrap')) {
        logEvent('scroll       .table-wrap top=' + t.scrollTop, '#aaa');
      }
    }, true);
  }

  // -------- 初期化 --------
  function init(){
    document.body.appendChild(panel);
    document.body.appendChild(showBtn);

    document.getElementById('__dbg_clear').onclick = function(){
      logEl.innerHTML = '';
      count = 0;
      updateCount();
    };
    document.getElementById('__dbg_hide').onclick = function(){
      panel.style.display = 'none';
      showBtn.style.display = 'block';
    };
    document.getElementById('__dbg_off').onclick = function(){
      try { localStorage.removeItem('debug'); } catch(_) {}
      panel.remove();
      showBtn.remove();
      alert('Debug off. Reload to confirm (URL の ?debug=1 も外してください).');
    };
    showBtn.onclick = function(){
      panel.style.display = 'block';
      showBtn.style.display = 'none';
    };

    // グローバル関数のラップ（DOMContentLoaded 時点で各 JS は parse 済み）
    wrapFunction('toggleFlightLogFullscreen');
    wrapFunction('confirmDeleteOne', function(no){ return 'no=' + no; });
    wrapFunction('confirmDeleteSelected');
    wrapFunction('confirmDeleteAll');
    wrapFunction('closeConfirm');
    wrapFunction('executeDelete');

    attachListeners();

    // 環境情報
    logEvent('debug enabled. UA: ' + (navigator.userAgent || '').substring(0, 90), '#fff');
    logEvent('window: ' + window.innerWidth + 'x' + window.innerHeight +
             ' | devicePixelRatio=' + window.devicePixelRatio +
             ' | touch=' + ('ontouchstart' in window), '#fff');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
