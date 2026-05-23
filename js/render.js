// =============================== RENDER (CORE) ===============================
// 描画の共通基盤と、各カードに分割していない汎用 UI（Stats / Bars / Top Flights /
// Expanded View / Toast / Empty&Dirty / Compare / Autocomplete / Bulk Preview）。
// 個別カードの描画は別ファイルへ：
//   render-charts.js : Continent / Year / Month / Weekday の Chart.js 描画
//   render-map.js    : Leaflet 2D + Globe.gl 3D
//   render-table.js  : Flight Log テーブル（描画・ソート・選択・拡大）
// 依存: AP, AIRPORT_DB (airports.js), DataSource, flights (datasource.js),
//       computeAll, getFiltered, parseMin (compute.js),
//       parseBulkFlights, parseBulkAirports (parse.js)

const BAR_GRADIENTS = {
  aircraft:   ['#ff4d6a','#e6003a'],
  airlines:   ['#ffb020','#e09000'],
  routes:     ['#3b9eff','#0070e0'],
  airports:   ['#00d68f','#00a86b'],
  countries:  ['#9d7aff','#7b4dff'],
  cities:     ['#ff8a3d','#e06a1a'],
};

// =============================== THEME (CSS VARIABLE BRIDGE) ===============================
// JS 側で色を使う箇所（Chart.js / Leaflet / Globe.gl）は、ハードコードではなく
// CSS 変数を参照する。テーマ切替（[data-theme="light"] の付け外し）に追従させるため、
// 描画のたびに getComputedStyle で最新値を読む。
//   例: cssVar('--accent') → '#3b9eff'（ダーク）/ '#2680e0'（ライト）
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// =============================== HTML ESCAPE ===============================
// innerHTML にユーザー入力（CSV データ・Add Flight モーダルの入力）を埋め込む際に挟む。
// CLAUDE.md「innerHTML への文字列代入はユーザー入力由来なら必ずエスケープ」規約。
//   _escapeHtml: 要素テキスト用（&,<,>,",' を実体参照化）
//   _escapeAttr: 属性値用（" を実体参照化。属性値内では <,> は無害なため最小限）
function _escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function _escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }

// =============================== BODY SCROLL LOCK ===============================
// 開いているオーバーレイの ID を Set で管理し、最後の 1 つが閉じたタイミングだけ
// body.style.overflow を解除する。複数オーバーレイ同時表示や新規追加時に、
// 片方を閉じた瞬間にもう片方のスクロールロックが外れる事故を防ぐ。
//
// 使い方：各 open*() で `_lockBodyScroll('overlayId')`、各 close*() で `_unlockBodyScroll('overlayId')`。
// 必ず ID を渡すこと（key を統一しないと多重 add で Set のサイズが合わなくなる）。
//
// ※ Flight Log フルスクリーン（`body.has-fullscreen-card{overflow:hidden;}`）は CSS クラス
//    側でロックしているので、この Set は介さず独立に動作する（互いに干渉しない）。
const _scrollLockSet = new Set();
function _lockBodyScroll(id){
  _scrollLockSet.add(id);
  document.body.style.overflow = 'hidden';
}
function _unlockBodyScroll(id){
  _scrollLockSet.delete(id);
  if(_scrollLockSet.size === 0) document.body.style.overflow = '';
}

// =============================== STATS ROW ===============================
// 全 6 カードが対応する拡大ウィンドウを開くクリックハンドラ付き。
// 起動先はサマリーから直感的にたどれる対応関係：
//   Flights → FlightLog 拡大
//   Flight Time → Top Flights by Time 拡大
//   Aircraft              → Aircraft バー拡大（時間ソートも可）
//   Routes / Airports     → 対応バーカード拡大
//   Countries/Regions     → Countries バー拡大（Continents 拡大ではない方を採用）
function renderStats(data){
  let totalMin=0;
  data.forEach(f=>totalMin+=parseMin(f.t));
  const h=Math.floor(totalMin/60),m=totalMin%60;
  const airports=new Set(); data.forEach(f=>{airports.add(f.dep.trim());airports.add(f.arr.trim());});
  const countries=new Set(); airports.forEach(c=>{const m=AP[c];if(m)countries.add(m.co);});
  const s=computeAll(data);
  // clickable な stat-box は `.is-clickable` クラス + onclick で対応拡大を起動。
  document.getElementById('statsGrid').innerHTML=
    `<div class="stat-box is-clickable" onclick="toggleFlightLogFullscreen()"><div class="num">${data.length}</div><div class="lbl">Flights</div></div>`+
    `<div class="stat-box is-clickable" onclick="openStatExpand('aircraft')"><div class="num">${Object.keys(Object.fromEntries(s.ac)).length}</div><div class="lbl">Aircraft</div></div>`+
    `<div class="stat-box is-clickable" onclick="openStatExpand('routes')"><div class="num">${s.rt.length}</div><div class="lbl">Routes</div></div>`+
    `<div class="stat-box is-clickable" onclick="openStatExpand('airports')"><div class="num">${airports.size}</div><div class="lbl">Airports</div></div>`+
    `<div class="stat-box is-clickable" onclick="openStatExpand('countries')"><div class="num">${countries.size}</div><div class="lbl">Countries/Regions</div></div>`+
    `<div class="stat-box is-clickable" onclick="openStatExpand('flights')"><div class="num">${h}h${m?m+'m':''}</div><div class="lbl">Flight Time</div></div>`;
}

// サマリーカードのクリック → 対応する拡大ウィンドウを起動。
function openStatExpand(kind){
  if(kind === 'flights'){
    openFlightsExpanded();
    return;
  }
  const s = computeAll(getFiltered());
  const map = { aircraft:['ac', s.acMin], routes:['rt', null], airports:['ap', null], countries:['co', null] };
  const entry = map[kind];
  if(!entry) return;
  const data = s[entry[0]];
  // 該当データが空（フィルタで 0 件など）なら空ウィンドウは出さず、トーストで知らせる
  if(!data || data.length === 0){
    showToast('No data to show','red');
    return;
  }
  openExpanded(kind, data, entry[1]);
}

// =============================== BAR RENDERING ===============================
// 総飛行時間（分）→「XhYYm」形式（h と m の間にスペースなし）。分はゼロ埋め 2 桁。
//   例: 9930 → "165h30m"、9900 → "165h00m"
function _fmtHM(mins){
  const h=Math.floor(mins/60), m=mins%60;
  return h + 'h' + (m<10?'0':'') + m + 'm';
}

// minsMap が渡されたカードでは、バー右側の専用カラム（.bar-time）に総飛行時間を
// 表示する。バー内は回数のみで視認性が高い。
function renderBars(id, data, colorKey, minsMap){
  const max=data[0]?data[0][1]:1;
  const total=data.reduce((s,d)=>s+d[1],0);
  const [c1,c2]=BAR_GRADIENTS[colorKey];
  document.getElementById(id).innerHTML=data.map(([label,count])=>{
    const pct=((count/max)*100).toFixed(0);
    const share=((count/total)*100).toFixed(0);
    const timeCol = minsMap
      ? `<span class="bar-time">${_fmtHM(minsMap[label]||0)}</span>`
      : '';
    return `<div class="bar-row">
      <span class="bar-label">${_escapeHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${c1},${c2});">${count}</div></div>
      ${timeCol}
      <span class="bar-pct">${share}%</span>
    </div>`;
  }).join('');
}

// type → 総時間マップ（あれば）を返す。機材／航空会社のみ対応。
function _minsMapForType(s, type){
  if(type==='aircraft') return s.acMin;
  if(type==='airlines') return s.alMin;
  return null;
}

// =============================== TOP FLIGHTS BY TIME ===============================
// 個別フライト（集計ではなく 1 行 1 フライト）を飛行時間で並べたランキング。
// モードはトグルで切り替え、refreshAll でも保持される（モジュール変数）。
let _topFlightsMode = 'longest'; // 'longest' | 'shortest'

function renderTopFlightsBars(){
  const container=document.getElementById('topFlightsBars');
  if(!container) return;
  const mode=_topFlightsMode;
  const data=getFiltered();
  if(data.length===0){
    container.innerHTML='<div style="padding:20px 4px;color:var(--text-3);font-size:12px;text-align:center;">No flights to rank</div>';
  } else {
    // 飛行時間で並べ替えて先頭 5 件
    const sorted=data.slice().sort((a,b)=>{
      const diff=parseMin(b.t)-parseMin(a.t);
      return mode==='shortest' ? -diff : diff;
    }).slice(0,5);
    // バー幅は「いま表示中の 5 件の最長」を 100% にしたプロポーション。
    // 結果として Shortest モードでも視覚的にスケールが効く。
    const maxMin=parseMin(sorted[0].t)||1;
    const [c1,c2]=['#00d4ff','#0095c8']; // 時間テーマのシアン
    container.innerHTML=sorted.map(f=>{
      const mins=parseMin(f.t);
      const widthPct=Math.max(2,(mins/maxMin)*100).toFixed(0);
      // hover で日付・エアライン詳細を見せる（クリック領域内）
      const safeTitle=_escapeAttr(`${f.date}  ·  ${f.al||''}`);
      return `<div class="bar-row" title="${safeTitle}">
        <span class="bar-label">${_escapeHtml(f.dep)}→${_escapeHtml(f.arr)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${widthPct}%;background:linear-gradient(90deg,${c1},${c2});">${_escapeHtml(f.t)}</div></div>
        <span class="bar-pct" style="width:54px;min-width:54px;text-align:right;">${_escapeHtml(f.ac)}</span>
      </div>`;
    }).join('');
  }
  // 拡大ウィンドウが開いていれば、同じ getFiltered() データで再描画（フィルタ追従）
  if(document.getElementById('flightsOverlay')?.classList.contains('show')){
    _renderFlightsExpanded();
  }
}

function setTopFlightsView(mode, btn){
  _topFlightsMode=mode;
  btn.parentElement.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderTopFlightsBars();
}

// --- Top Flights 拡大ウィンドウ ---
// インラインの Longest/Shortest トグルとは独立した、専用のソート状態を持つ。
// フィルタは getFiltered() を経由するので、グローバルフィルタチップに自動追従。
let _flightsExpandedSort='time-desc'; // 'time-desc' | 'time-asc' | 'date-desc' | 'date-asc'

function openFlightsExpanded(){
  if(DataSource.count===0){ showToast('No flights to show','red'); return; }
  document.getElementById('flightsOverlay').classList.add('show');
  _lockBodyScroll('flightsOverlay');
  // 開くたびにデフォルト Time desc に戻す（前回のソート状態を引きずらない）
  const sel=document.getElementById('flightsSort');
  if(sel){ sel.value='time-desc'; }
  _flightsExpandedSort='time-desc';
  _renderFlightsExpanded();
}

function closeFlightsExpanded(){
  document.getElementById('flightsOverlay').classList.remove('show');
  _unlockBodyScroll('flightsOverlay');
}

function onFlightsSortChange(){
  const sel=document.getElementById('flightsSort');
  if(sel) _flightsExpandedSort=sel.value;
  _renderFlightsExpanded();
}

function _renderFlightsExpanded(){
  const data=getFiltered();
  const totalEl=document.getElementById('flightsExpandedTotal');
  const scrollEl=document.getElementById('flightsExpandedScroll');
  if(!scrollEl) return;
  if(totalEl) totalEl.textContent=data.length;
  if(data.length===0){
    scrollEl.innerHTML='<div style="padding:40px;text-align:center;color:var(--text-3);">No flights match current filters</div>';
    return;
  }
  const sorted=data.slice().sort((a,b)=>{
    switch(_flightsExpandedSort){
      case 'time-asc':  return parseMin(a.t)-parseMin(b.t);
      case 'date-desc': return String(b.date).localeCompare(String(a.date));
      case 'date-asc':  return String(a.date).localeCompare(String(b.date));
      case 'time-desc':
      default:          return parseMin(b.t)-parseMin(a.t);
    }
  });
  // バー幅の基準：時間ソート時は全件の最長、日付ソート時もデータの最長で揃える
  const maxMin=Math.max(...sorted.map(f=>parseMin(f.t)))||1;
  const [c1,c2]=['#00d4ff','#0095c8'];
  scrollEl.innerHTML=sorted.map((f,i)=>{
    const mins=parseMin(f.t);
    const widthPct=Math.max(2,(mins/maxMin)*100).toFixed(0);
    const safeAl=_escapeAttr(f.al||'');
    return `<div class="flight-row" title="${safeAl}">
      <span class="flight-row-rank">#${i+1}</span>
      <span class="flight-row-date">${_escapeHtml(f.date)}</span>
      <span class="flight-row-route">${_escapeHtml(f.dep)} → ${_escapeHtml(f.arr)}</span>
      <span class="flight-row-ac">${_escapeHtml(f.ac)}</span>
      <span class="flight-row-airline">${_escapeHtml(f.al||'')}</span>
      <div class="flight-row-track"><div class="flight-row-fill" style="width:${widthPct}%;background:linear-gradient(90deg,${c1},${c2});">${_escapeHtml(f.t)}</div></div>
    </div>`;
  }).join('');
}

function setView(type, mode, btn){
  btn.parentElement.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const s=computeAll(getFiltered());
  const map={aircraft:'ac',airlines:'al',routes:'rt',airports:'ap',countries:'co',cities:'ci'};
  const data=s[map[type]];
  const minsMap=_minsMapForType(s, type);
  if(mode==='top5'){
    renderBars(type+'Bars',data.slice(0,5),type, minsMap);
  } else {
    openExpanded(type, data, minsMap);
    // Reset to top5
    btn.parentElement.querySelector('.toggle-btn').classList.add('active');
    btn.classList.remove('active');
  }
}

// =============================== EXPANDED VIEW ===============================
// 拡大ウィンドウは開いている間、type / data / minsMap を保持しておき、
// ヘッダのソートセレクタが変わったら同じデータで再描画する。
let _expandedState = null; // { type, data, minsMap }

// 与えられたソートキーで [[label,count],...] を並べ替え。
// time-* は minsMap が無いと count にフォールバック。
function _sortExpanded(data, minsMap, sortKey){
  const arr = data.slice();
  const minsOf = label => (minsMap && minsMap[label]) || 0;
  switch(sortKey){
    case 'count-asc':  arr.sort((a,b)=> a[1] - b[1]); break;
    case 'time-desc':  arr.sort((a,b)=> minsOf(b[0]) - minsOf(a[0])); break;
    case 'time-asc':   arr.sort((a,b)=> minsOf(a[0]) - minsOf(b[0])); break;
    case 'name-asc':   arr.sort((a,b)=> String(a[0]).localeCompare(String(b[0]))); break;
    case 'name-desc':  arr.sort((a,b)=> String(b[0]).localeCompare(String(a[0]))); break;
    case 'count-desc':
    default:           arr.sort((a,b)=> b[1] - a[1]); break;
  }
  return arr;
}

// time-* ソート時はバーの高さも時間ベース、それ以外は回数ベース。
// 値ラベル（上）は常に回数のみ、時間はバー内部の上端に控えめに表示。
function _renderExpandedBars(){
  if(!_expandedState) return;
  const { type, data, minsMap } = _expandedState;
  const sortSel = document.getElementById('expandedSort');
  const sortKey = (sortSel && sortSel.value) || 'count-desc';
  const useTime = sortKey.startsWith('time') && minsMap;
  const sorted = _sortExpanded(data, minsMap, sortKey);
  const valueFor = useTime
    ? ([label]) => (minsMap[label]||0)
    : ([,count]) => count;
  const [c1,c2]=BAR_GRADIENTS[type];
  const max=sorted.length ? Math.max(...sorted.map(valueFor)) || 1 : 1;
  const total=sorted.reduce((s,it)=>s+valueFor(it),0) || 1;
  const maxH=220;
  document.getElementById('expandedScroll').innerHTML=sorted.map(item=>{
    const [label,count]=item;
    const v=valueFor(item);
    const h=Math.max(24,(v/max)*maxH);
    const share=((v/total)*100).toFixed(0);
    // 表示位置の方針：
    //   minsMap あり（aircraft / airlines）: 回数を上、時間をバー内
    //   minsMap なし（continents / routes / 等）: 回数をバー内に大きく、上はカラ
    const valHtml = minsMap ? `${count}` : '';
    const timeInBar = minsMap
      ? `<span class="expanded-bar-time-in">${_fmtHM(minsMap[label]||0)}</span>`
      : '';
    const countInBar = minsMap
      ? ''
      : `<span class="expanded-bar-count-in">${count}</span>`;
    // title 属性でフルネームを hover 表示（長い名前は省略されるため）
    const safeLabel = _escapeAttr(label);
    const labelHtml = _escapeHtml(label);
    // expanded-bar-stack（固定高さ）の中で「値は上端」「バーは下端」に貼り付け、
    // バーの高さは可変 → 値ラベルの y 座標がバー高さに依存しない（上端で揃う）。
    return `<div class="expanded-bar-item" title="${safeLabel}">
      <div class="expanded-bar-stack">
        <div class="expanded-bar-val">${valHtml}</div>
        <div class="expanded-bar-col" style="height:${h}px;background:linear-gradient(180deg,${c1},${c2});">${countInBar}${timeInBar}</div>
      </div>
      <div class="expanded-bar-name">${labelHtml}</div>
      <div class="expanded-bar-pct">${share}%</div>
    </div>`;
  }).join('');
}

// ソートセレクタの「Time」関連オプションは、minsMap が無いカードでは非表示にする。
function _configureExpandedSort(minsMap){
  const sel = document.getElementById('expandedSort');
  if(!sel) return;
  sel.querySelectorAll('option[data-time-only]').forEach(o => {
    o.hidden = !minsMap;
    o.disabled = !minsMap;
  });
  // 拡大表示を開いたら常に既定（Count ▾）に戻す。前回のソート状態を引きずらない。
  sel.value = 'count-desc';
}

function openExpanded(type, data, minsMap){
  const titles={aircraft:'Top Aircraft',airlines:'Top Airlines',routes:'Top Routes',airports:'Top Airports',countries:'Top Countries/Regions',cities:'Top Cities'};
  const subtitles={aircraft:'total aircraft types',airlines:'total airlines',routes:'total routes',airports:'total airports',countries:'total countries/regions',cities:'total cities'};
  const [c1,_c2]=BAR_GRADIENTS[type];
  document.getElementById('expandedTitle').textContent=titles[type];
  document.getElementById('expandedTotal').textContent=data.length;
  document.getElementById('expandedTotal').style.color=c1;
  document.getElementById('expandedSub').textContent=subtitles[type];
  _expandedState = { type, data, minsMap };
  _configureExpandedSort(minsMap);
  _renderExpandedBars();
  document.getElementById('expandedOverlay').classList.add('show');
  _lockBodyScroll('expandedOverlay');
}

function onExpandedSortChange(){ _renderExpandedBars(); }

function closeExpanded(){
  document.getElementById('expandedOverlay').classList.remove('show');
  _unlockBodyScroll('expandedOverlay');
  _expandedState = null;
}

// =============================== TOAST ===============================
function showToast(msg,variant){
  const toast=document.getElementById('toast');
  toast.textContent=msg;
  toast.className='toast'+(variant==='red'?' toast-red':'');
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'),2500);
}

// =============================== EMPTY STATE / DIRTY BANNER ===============================
function refreshEmptyState(){
  const isEmpty = DataSource.count===0;
  document.body.classList.toggle('is-empty', isEmpty);
}
// 旧 dirty-banner（未保存警告）の置き換え：常設バナーは廃止し、ヘッダの
// 保存ステータスアイコンに集約した。アイコンの「データありで表示／空状態で非表示」は
// CSS の `body.is-empty #saveStatus{display:none;}` で自動制御されるため、ここでは
// 何もしない（関数名は既存呼び出しを壊さないため維持）。
function refreshDirtyBanner(){
  // no-op：表示制御は CSS 側に移行済み
}

// =============================== COMPARE SECTION ===============================
// 任意の2年を比較（フェーズ3で renderYoY を一般化）。
// アンカーカード内のセレクタで yearA / yearB を選ぶ → CompareState を介して再描画。
// データレイヤー：compareStats(setA, setB) （compute.js）。
function _fmtMin(mins){const h=Math.floor(mins/60),m=mins%60;return h+'h'+(m?String(m).padStart(2,'0')+'m':'');}

// 集合A の値 vs 集合B の値 を 1 枚のカードで表現。
// formatter は表示用整形関数（数値そのまま、時間整形、など）。
function _compareCard(label, valA, valB, formatter, prevLabel){
  const pct = (now, then) => then===0 ? (now>0 ? Infinity : 0) : Math.round(((now-then)/then)*100);
  const delta = pct(valA, valB);
  const cls   = delta>0?'up':delta<0?'down':'flat';
  const arrow = delta>0?'▲':delta<0?'▼':'─';
  const sign  = delta>0?'+':'';
  const deltaTxt = delta===Infinity ? 'NEW' : sign+delta+'%';
  return `<div class="yoy-card">
    <div class="yoy-label">${label}</div>
    <div class="yoy-value">${formatter(valA)}</div>
    <span class="yoy-delta ${cls}">${arrow} ${deltaTxt}</span>
    <div class="yoy-prev">${_escapeHtml(prevLabel)}: ${formatter(valB)}</div>
  </div>`;
}

// アンカーカード内の年セレクタを再構築。years は昇順、newest first で表示。
function _renderCompareSelectors(years){
  const opts = years.slice().reverse(); // newest first
  const buildOpts = (selected, otherSelected) => opts.map(y => {
    // 反対側に既に選ばれている年は薄く表示（選択不可ではなく示唆だけ）
    const isDim = (y===otherSelected) ? ' style="color:var(--text-3);"' : '';
    return `<option value="${y}"${isDim}${y===selected?' selected':''}>${y}</option>`;
  }).join('');
  const selA = document.getElementById('compareYearA');
  const selB = document.getElementById('compareYearB');
  if(selA) selA.innerHTML = buildOpts(CompareState.yearA, CompareState.yearB);
  if(selB) selB.innerHTML = buildOpts(CompareState.yearB, CompareState.yearA);
}

function renderCompare(){
  const section=document.getElementById('yoySection');
  // 全フライトから年一覧（フィルタ非依存：比較は両年データを必要とする）
  const years=[...new Set(flights.map(f=>f.date.slice(0,4)))].sort();
  if(years.length<2){ section.style.display='none'; return; }
  // CompareState の初期化／妥当性チェック
  // - 空 or データから消えた年が入っていれば既定値（最新／その前）へ
  // - yearA===yearB になっていれば yearB を別の年に
  if(!CompareState.yearA || !years.includes(CompareState.yearA)){
    CompareState.yearA = years[years.length-1];
  }
  if(!CompareState.yearB || !years.includes(CompareState.yearB) || CompareState.yearB===CompareState.yearA){
    CompareState.yearB = years[years.length-2];
    if(CompareState.yearB===CompareState.yearA){
      // 念のため：yearA が最古でも yearB が同じにならないようにずらす
      CompareState.yearB = years.find(y => y!==CompareState.yearA) || years[0];
    }
  }
  _renderCompareSelectors(years);
  // 2 集合をフライトから抽出して比較
  const yA=CompareState.yearA, yB=CompareState.yearB;
  const setA = flights.filter(f => f.date.startsWith(yA));
  const setB = flights.filter(f => f.date.startsWith(yB));
  const { a, b } = compareStats(setA, setB);
  document.getElementById('yoyMetrics').innerHTML =
    _compareCard('Flights',          a.count,           b.count,           v=>v,     yB) +
    _compareCard('Hours',            a.mins,            b.mins,            _fmtMin,  yB) +
    _compareCard('Countries/Regions',a.countries.size,  b.countries.size,  v=>v,     yB);
  section.style.display='';
}

// =============================== AUTOCOMPLETE ===============================
function getACData(type){
  if(type==='airport'){
    // Merge AP + AIRPORT_DB keys with city info
    const all={};
    Object.keys(AIRPORT_DB).forEach(c=>{all[c]=AIRPORT_DB[c].city+', '+AIRPORT_DB[c].co;});
    Object.keys(AP).forEach(c=>{all[c]=AP[c].city+', '+AP[c].co;});
    return Object.entries(all).map(([code,detail])=>({code,detail}));
  }
  if(type==='aircraft'){
    const set=new Set(); flights.forEach(f=>set.add(f.ac));
    // Add common IF aircraft
    ['A319','A320','A321','A332','A333','A339','A346','A359','A388','A380',
     'B738','B739','B744','B748','B752','B763','B772','B77L','B77W','B788','B789','B78X',
     'BCS1','BCS3','C172','CRJ7','CRJ9','E170','E175','E190','E195','MD11','DC10',
     'CL35','C208','TBM9','SR22','PC12','GLF6','F22','C17','VC25A','C40B/C',
     'A220','A310','A340','B737','B747','B757','B767','B787'].forEach(a=>set.add(a));
    return [...set].sort().map(code=>({code,detail:''}));
  }
  if(type==='airline'){
    const set=new Set(); flights.forEach(f=>set.add(f.al));
    return [...set].sort().map(code=>({code,detail:''}));
  }
  if(type==='time-h' || type==='time-m'){
    // Flight Time（分離入力）：h / m それぞれでプリセット範囲を数値順に提示。
    //   time-h: 0〜24（履歴に >24 がある場合は末尾に追加）
    //   time-m: 0, 5, 10, ..., 55（履歴の正確な分も含めて数値順）
    // 履歴ありの値には `N×` バッジを付ける（並び順には影響させない）。
    const isH = type==='time-h';
    const re = isH ? /^(\d+)h/ : /h(\d+)m$/;
    const counts = {};
    flights.forEach(f => {
      const m = (f.t||'').match(re);
      if(m){ const v = String(parseInt(m[1], 10)); counts[v] = (counts[v]||0) + 1; }
    });
    const values = [];
    if(isH){ for(let i=0;i<=24;i++) values.push(String(i)); }
    else   { for(let i=0;i<60;i+=5) values.push(String(i)); }
    // 履歴にあって範囲外の値（例：h > 24、m が 5刻みでない実績）も末尾に追加
    Object.keys(counts).forEach(v => { if(!values.includes(v)) values.push(v); });
    // 全体を数値順でソート
    values.sort((a,b) => parseInt(a,10) - parseInt(b,10));
    return values.map(code => ({code, detail: counts[code] ? `${counts[code]}×` : ''}));
  }
  return [];
}

function acUpdate(inputId, type){
  const input=document.getElementById(inputId);
  const list=document.getElementById(inputId+'-ac');
  const q=input.value.toUpperCase().trim();
  if(q.length===0){
    // Show recent/popular items
    const data=getACData(type).slice(0,8);
    renderACList(list,data,inputId);
    list.classList.add('show');
    return;
  }
  const data=getACData(type);
  const matches=data.filter(d=>
    d.code.toUpperCase().includes(q) || d.detail.toUpperCase().includes(q)
  ).slice(0,10);
  if(matches.length>0){
    renderACList(list,matches,inputId);
    list.classList.add('show');
  } else {
    list.classList.remove('show');
  }
}

function renderACList(list,items,inputId){
  list.innerHTML=items.map(d=>{
    const badge=d.detail?`<span class="ac-detail">${_escapeHtml(d.detail)}</span>`:'';
    // onmousedown 属性内の JS 文字列に code を埋め込むため、二段階エスケープ：
    //   ① JS 文字列内の `'` を `\'` に（acSelect の第2引数の '...' を壊さないため）
    //   ② HTML 属性内の `"` を `&quot;` に（onmousedown="..." を壊さないため）
    const jsCode = _escapeAttr(d.code.replace(/'/g,"\\'"));
    return `<div class="ac-item" onmousedown="acSelect('${inputId}','${jsCode}')">
      <span class="ac-code">${_escapeHtml(d.code)}</span>${badge}
    </div>`;
  }).join('');
}

function acSelect(inputId, value){
  document.getElementById(inputId).value=value;
  document.getElementById(inputId+'-ac').classList.remove('show');
}

function acHide(inputId){
  document.getElementById(inputId+'-ac').classList.remove('show');
}

// =============================== BULK IMPORT PREVIEW ===============================
function previewBulk(){
  const text=document.getElementById('bulkCSV').value;
  const preview=document.getElementById('bulkPreview');
  const count=document.getElementById('bulkCount');
  if(!text.trim()){preview.style.display='none';count.style.display='none';return;}
  const parsed=parseBulkFlights(text);
  const validCount=parsed.filter(r=>r.valid).length;
  const invalidCount=parsed.filter(r=>!r.valid).length;
  const fixedCount=parsed.filter(r=>r.valid && r.fixes && r.fixes.length>0).length;
  count.innerHTML=`<span class="valid">✓ ${validCount} valid</span>`
    +(fixedCount?`<span style="color:var(--cyan);">🔧 ${fixedCount} auto-fixed</span>`:'')
    +(invalidCount?`<span class="invalid">✕ ${invalidCount} errors</span>`:'');
  count.style.display='flex';
  if(parsed.length===0){preview.style.display='none';return;}
  let html='<table><thead><tr><th>Date</th><th>Route</th><th>Aircraft</th><th>Airline</th><th>Time</th><th>Status</th></tr></thead><tbody>';
  parsed.forEach(r=>{
    if(r.valid){
      const hasFixes=r.fixes && r.fixes.length>0;
      const fixTip=hasFixes?` title="${_escapeAttr(r.fixes.join(', '))}"`:''
      const statusIcon=hasFixes?'🔧':'✓';
      const statusCol=hasFixes?'var(--cyan)':'var(--green)';
      html+=`<tr><td>${_escapeHtml(r.date)}</td><td style="color:var(--accent);font-weight:600;">${_escapeHtml(r.dep)} → ${_escapeHtml(r.arr)}</td><td>${_escapeHtml(r.ac)}</td><td>${_escapeHtml(r.al)}</td><td>${_escapeHtml(r.t)}</td><td style="color:${statusCol};cursor:${hasFixes?'help':'default'};"${fixTip}>${statusIcon}</td></tr>`;
    } else {
      html+=`<tr class="row-error"><td colspan="5">${_escapeHtml(r.raw.substring(0,80))}</td><td>${_escapeHtml(r.reason)}</td></tr>`;
    }
  });
  html+='</tbody></table>';
  preview.innerHTML=html;
  preview.style.display='';
}

function previewAirports(){
  const text=document.getElementById('bulkAirportCSV').value;
  const preview=document.getElementById('apBulkPreview');
  const count=document.getElementById('apBulkCount');
  if(!text.trim()){preview.style.display='none';count.style.display='none';return;}
  const parsed=parseBulkAirports(text);
  const validCount=parsed.filter(r=>r.valid).length;
  const invalidCount=parsed.filter(r=>!r.valid).length;
  const autoCount=parsed.filter(r=>r.valid && r.source==='auto').length;
  const existCount=parsed.filter(r=>r.valid && r.source==='existing').length;
  count.innerHTML=`<span class="valid">✓ ${validCount} valid</span>`
    +(autoCount?`<span style="color:var(--cyan);">⚡ ${autoCount} auto</span>`:'')
    +(existCount?`<span style="color:var(--amber);">● ${existCount} existing</span>`:'')
    +(invalidCount?`<span class="invalid">✕ ${invalidCount} errors</span>`:'');
  count.style.display='flex';
  if(parsed.length===0){preview.style.display='none';return;}
  let html='<table><thead><tr><th>ICAO</th><th>City</th><th>Country</th><th>Continent</th><th>Coords</th><th>Source</th></tr></thead><tbody>';
  parsed.forEach(r=>{
    if(r.valid){
      const labels={auto:'⚡ DB Auto',existing:'● Already loaded',manual:'✎ Manual'};
      const colors={auto:'var(--cyan)',existing:'var(--amber)',manual:'var(--green)'};
      html+=`<tr><td style="font-weight:600;color:var(--accent);">${_escapeHtml(r.icao)}</td><td>${_escapeHtml(r.city)}</td><td>${_escapeHtml(r.co)}</td><td>${_escapeHtml(r.ct)}</td><td>${r.lat.toFixed(2)}, ${r.lng.toFixed(2)}</td><td style="color:${colors[r.source]};">${labels[r.source]}</td></tr>`;
    } else {
      html+=`<tr class="row-error"><td colspan="5">${_escapeHtml(r.raw.substring(0,80))}</td><td>${_escapeHtml(r.reason)}</td></tr>`;
    }
  });
  html+='</tbody></table>';
  preview.innerHTML=html;
  preview.style.display='';
}
