// =============================== RENDER ===============================
// 画面描画関数群。Stats / Bars / Map / Charts / Table / Toast /
// Autocomplete / Empty&Dirty / YoY / Bulk preview を含む。
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

// =============================== STATS ROW ===============================
function renderStats(data){
  let totalMin=0;
  data.forEach(f=>totalMin+=parseMin(f.t));
  const h=Math.floor(totalMin/60),m=totalMin%60;
  const airports=new Set(); data.forEach(f=>{airports.add(f.dep.trim());airports.add(f.arr.trim());});
  const countries=new Set(); airports.forEach(c=>{const m=AP[c];if(m)countries.add(m.co);});
  const s=computeAll(data);
  document.getElementById('statsGrid').innerHTML=
    `<div class="stat-box"><div class="num">${data.length}</div><div class="lbl">Flights</div></div>`+
    `<div class="stat-box"><div class="num">${Object.keys(Object.fromEntries(s.ac)).length}</div><div class="lbl">Aircraft</div></div>`+
    `<div class="stat-box"><div class="num">${s.rt.length}</div><div class="lbl">Routes</div></div>`+
    `<div class="stat-box"><div class="num">${airports.size}</div><div class="lbl">Airports</div></div>`+
    `<div class="stat-box"><div class="num">${countries.size}</div><div class="lbl">Countries/Regions</div></div>`+
    `<div class="stat-box"><div class="num">${h}h${m?m+'m':''}</div><div class="lbl">Flight Time</div></div>`;
}

// =============================== BAR RENDERING ===============================
// 総飛行時間（分）→「Xh YYm」形式。分はゼロ埋め 2 桁。
//   例: 9930 → "165h 30m"、9900 → "165h 00m"
function _fmtHM(mins){
  const h=Math.floor(mins/60), m=mins%60;
  return h + 'h ' + (m<10?'0':'') + m + 'm';
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
      <span class="bar-label">${label}</span>
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
      const safeTitle=`${f.date}  ·  ${String(f.al||'').replace(/"/g,'&quot;')}`;
      return `<div class="bar-row" title="${safeTitle}">
        <span class="bar-label">${f.dep}→${f.arr}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${widthPct}%;background:linear-gradient(90deg,${c1},${c2});">${f.t}</div></div>
        <span class="bar-pct" style="width:54px;min-width:54px;text-align:right;">${f.ac}</span>
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
  document.body.style.overflow='hidden';
  // 開くたびにデフォルト Time desc に戻す（前回のソート状態を引きずらない）
  const sel=document.getElementById('flightsSort');
  if(sel){ sel.value='time-desc'; }
  _flightsExpandedSort='time-desc';
  _renderFlightsExpanded();
}

function closeFlightsExpanded(){
  document.getElementById('flightsOverlay').classList.remove('show');
  document.body.style.overflow='';
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
    const safeAl=String(f.al||'').replace(/"/g,'&quot;');
    return `<div class="flight-row" title="${safeAl}">
      <span class="flight-row-rank">#${i+1}</span>
      <span class="flight-row-date">${f.date}</span>
      <span class="flight-row-route">${f.dep} → ${f.arr}</span>
      <span class="flight-row-ac">${f.ac}</span>
      <span class="flight-row-airline">${f.al||''}</span>
      <div class="flight-row-track"><div class="flight-row-fill" style="width:${widthPct}%;background:linear-gradient(90deg,${c1},${c2});">${f.t}</div></div>
    </div>`;
  }).join('');
}

// Flight Log フッターの内容を現在のフィルタ済みデータで更新。
// CSS で通常時は display:none、フルスクリーン時のみ表示されるが、内容は常に最新に保つ。
function _updateFlightLogFooter(){
  const data=getFiltered();
  const totalMin=data.reduce((s,f)=>s+parseMin(f.t),0);
  const c=document.getElementById('flightLogFooterCount');
  const t=document.getElementById('flightLogFooterTime');
  if(c) c.textContent=`${data.length} flight${data.length===1?'':'s'}`;
  if(t) t.textContent=`${_fmtHM(totalMin)} total`;
}

// --- Flight Log 拡大モーダル ---
// カード自体に .card-fullscreen を付けて画面中央に modal 風表示。
// 高さはコンテンツ量に応じて伸縮（フィット〜100vh-48px）、backdrop 付き。
// 開いている間：ボタンアイコンを ⛶ → ✕ に。
function toggleFlightLogFullscreen(){
  const section=document.querySelector('.card.table-section');
  const backdrop=document.getElementById('fullscreenBackdrop');
  if(!section) return;
  const btn=section.querySelector('.card-expand-btn');
  const isOpen=section.classList.contains('card-fullscreen');
  if(isOpen){
    section.classList.remove('card-fullscreen');
    if(backdrop) backdrop.classList.remove('show');
    document.body.classList.remove('has-fullscreen-card');
    if(btn){ btn.textContent='⛶'; btn.title='Expand'; }
  } else {
    section.classList.add('card-fullscreen');
    if(backdrop) backdrop.classList.add('show');
    document.body.classList.add('has-fullscreen-card');
    if(btn){ btn.textContent='✕'; btn.title='Close'; }
  }
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
    const safeLabel = String(label).replace(/"/g,'&quot;');
    // expanded-bar-stack（固定高さ）の中で「値は上端」「バーは下端」に貼り付け、
    // バーの高さは可変 → 値ラベルの y 座標がバー高さに依存しない（上端で揃う）。
    return `<div class="expanded-bar-item" title="${safeLabel}">
      <div class="expanded-bar-stack">
        <div class="expanded-bar-val">${valHtml}</div>
        <div class="expanded-bar-col" style="height:${h}px;background:linear-gradient(180deg,${c1},${c2});">${countInBar}${timeInBar}</div>
      </div>
      <div class="expanded-bar-name">${label}</div>
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
  document.body.style.overflow='hidden';
}

function onExpandedSortChange(){ _renderExpandedBars(); }

// Continents カード専用の拡大表示。インラインも拡大も doughnut（拡大版はラベル・
// 凡例・スペーシングを大きく取る）。マップ拡大と同じパターン：別オーバーレイで
// Chart.js インスタンスを別に持ち、フィルタ変更時は renderCharts から更新される。
function openContinentsExpanded(){
  const s=computeAll(getFiltered());
  if(!s.ct || s.ct.length===0){ showToast('No data to show','red'); return; }
  document.getElementById('continentsOverlay').classList.add('show');
  document.body.style.overflow='hidden';
  // モーダル CSS アニメ完了後に canvas 寸法が確定する。少し待ってから描画。
  setTimeout(()=>_renderContinentsLargeChart(s.ct), 250);
}

function closeContinentsExpanded(){
  document.getElementById('continentsOverlay').classList.remove('show');
  document.body.style.overflow='';
  if(cContinentLarge){ cContinentLarge.destroy(); cContinentLarge=null; }
}

function _renderContinentsLargeChart(ctData){
  const canvas=document.getElementById('continentChartLarge');
  if(!canvas) return;
  const ctxC=canvas.getContext('2d');
  if(cContinentLarge) cContinentLarge.destroy();
  const ctTotal=ctData.reduce((sum,d)=>sum+d[1],0);
  cContinentLarge=new Chart(ctxC,{type:'doughnut',data:{
    labels:ctData.map(d=>d[0]),
    datasets:[{
      data:ctData.map(d=>d[1]),
      backgroundColor:ctData.map(d=>CT_COLORS[d[0]]||'#4d5f7a'),
      borderWidth:0,borderRadius:6,spacing:4,
    }]
  },options:{
    responsive:true,maintainAspectRatio:false,cutout:'58%',
    plugins:{
      legend:{position:'bottom',labels:{
        color:'#c8d3e3',font:{family:'Outfit',size:14},padding:20,
        usePointStyle:true,pointStyleWidth:12,
      }},
      tooltip:{callbacks:{label:ctx=>{
        const v=ctx.parsed;
        const pct=ctTotal?((v/ctTotal)*100).toFixed(1):'0.0';
        return ` ${v} flights (${pct}%)`;
      }}}
    }
  }});
}
function closeExpanded(){
  document.getElementById('expandedOverlay').classList.remove('show');
  document.body.style.overflow='';
  _expandedState = null;
}

// =============================== MAP ===============================
// インラインの 2D 地図と、Map header の「🔍 Expand」で開く拡大ウィンドウ用の
// 2 つめの Leaflet インスタンスを並行して持つ。両者は同じ getFiltered() データを
// 共有し、_drawMapLayers ヘルパで同じ描画ロジックを使う。
let map, routeLines=[], markers=[];
let mapExpanded=null, routeLinesExpanded=[], markersExpanded=[];

// Leaflet マップ初期化の共通設定（インライン／拡大の両方で同一設定）
function _createMapAt(containerId){
  const m=L.map(containerId,{
    center:[20,100],zoom:2,zoomControl:true,
    attributionControl:false,
    worldCopyJump:false,
    minZoom:1,
    maxBounds:[[-85,-30],[85,340]],
    maxBoundsViscosity:1.0,
  });
  // dark_all は国名・都市名のラベル入りタイル（ズームで詳細度が上がる）。
  // ※ 太平洋中心レイアウトの副作用で低ズーム時に世界が左右に繰り返し表示される。
  //   3D 地球ボタンで Globe.gl の地球儀ビューに切り替え可能。
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
    subdomains:'abcd',maxZoom:18,
    noWrap:false,
  }).addTo(m);
  return m;
}

function initMap(){
  map=_createMapAt('flightMap');
}

// 拡大ウィンドウ用の Leaflet インスタンスを遅延初期化。
// 初回 openMapExpanded() で一度だけ呼ばれる。
function initMapExpanded(){
  if(mapExpanded) return;
  mapExpanded=_createMapAt('flightMapExpanded');
}

// Shift western hemisphere longitudes eastward so the map reads:
// Africa → Europe → Asia → Pacific → Americas (left to right)
// This prevents the Americas from appearing on the left and avoids world wrapping issues.
function mapLng(lng){
  return lng < -25 ? lng + 360 : lng;
}

// 指定の Leaflet インスタンスに「ルート＋空港マーカー」を描き直す共通ヘルパ。
// routeLinesArr / markersArr は呼び出し側の配列を直接書き換える（同じ参照を保つ）。
// fitMaxZoom: fitBounds の上限ズーム。インライン=3、拡大ウィンドウ=5（縦に空白が出にくい）。
function _drawMapLayers(targetMap, data, routeLinesArr, markersArr, fitMaxZoom){
  routeLinesArr.forEach(l=>targetMap.removeLayer(l));
  routeLinesArr.length=0;
  markersArr.forEach(m=>targetMap.removeLayer(m));
  markersArr.length=0;

  const apCount={};
  data.forEach(f=>{
    apCount[f.dep.trim()]=(apCount[f.dep.trim()]||0)+1;
    apCount[f.arr.trim()]=(apCount[f.arr.trim()]||0)+1;
  });

  // Routes
  const routeSet=new Set();
  data.forEach(f=>{
    const d=f.dep.trim(), a=f.arr.trim();
    const key=[d,a].sort().join('-');
    if(routeSet.has(key)) return;
    routeSet.add(key);
    const p1=AP[d], p2=AP[a];
    if(!p1||!p2) return;
    const line=L.polyline(
      [[p1.lat,mapLng(p1.lng)],[p2.lat,mapLng(p2.lng)]],
      {color:'#3b9eff',weight:1.5,opacity:0.35,dashArray:'6,4'}
    ).addTo(targetMap);
    routeLinesArr.push(line);
  });

  // Airport markers — 見た目を保ちつつタッチ用に大きな不可視ヒットエリアを重ねる
  Object.entries(apCount).forEach(([code,count])=>{
    const a=AP[code];
    if(!a) return;
    const isHub=count>=10;
    const size=isHub?14:Math.max(6,Math.min(12,count*1.5+4));
    const color=isHub?'#ffb020':'#ff4d6a';
    const latlng=[a.lat,mapLng(a.lng)];
    // 1) 視覚マーカー（従来通りのデザイン）
    const marker=L.circleMarker(latlng,{
      radius:size/2, fillColor:color, fillOpacity:0.8,
      color:color, weight:1, opacity:0.3,
      interactive:false, // クリックはヒットエリアに任せる
    }).addTo(targetMap);
    markersArr.push(marker);
    // 2) タップ用の不可視ヒットエリア（最低 22px 直径＝指で押しやすい大きさ）
    const hitR=Math.max(size/2, 12);
    const hit=L.circleMarker(latlng,{
      radius:hitR, fillOpacity:0, opacity:0, weight:0,
    }).addTo(targetMap);
    hit.bindTooltip(`<b>${code}</b> — ${a.city}<br>${count} flights`,{
      className:'map-tooltip',direction:'top',offset:[0,-8],
    });
    markersArr.push(hit);
  });

  // Fit bounds — show all airports and routes, cap zoom so full network is visible
  if(markersArr.length>0){
    const group=L.featureGroup([...markersArr,...routeLinesArr]);
    targetMap.fitBounds(group.getBounds().pad(0.05),{maxZoom: fitMaxZoom ?? 3});
  }
}

function renderMap(data){
  // インラインは maxZoom:3、拡大ウィンドウは maxZoom:5 で広めに zoom in
  // → コンテナ縦サイズが大きい拡大時に上下の余白が減る
  _drawMapLayers(map, data, routeLines, markers, 3);
  if(mapExpanded){
    _drawMapLayers(mapExpanded, data, routeLinesExpanded, markersExpanded, 5);
  }
}

// 拡大ウィンドウ表示時に呼ぶ。コンテナサイズが確定した後の再計算。
function resizeMapExpanded(){
  if(mapExpanded && mapExpanded.invalidateSize) mapExpanded.invalidateSize();
}

// =============================== 3D GLOBE (Globe.gl) ===============================
// 太平洋中心レイアウトの 2D 地図とは違い、球体は継ぎ目なし＝座標シフト不要。
// 元の lat/lng をそのまま使う。
let _globe = null;

function _globeLabelHTML(html){
  return `<div style="background:rgba(13,21,32,0.95);border:1px solid #1a2744;color:#e8edf5;`+
    `padding:6px 10px;border-radius:6px;font-family:Outfit,sans-serif;font-size:12px;`+
    `box-shadow:0 4px 16px rgba(0,0,0,0.5);">${html}</div>`;
}

function initGlobe(){
  if(_globe) return;
  const container = document.getElementById('globeContainer');
  _globe = Globe()(container)
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundColor('rgba(0,0,0,0)')
    .atmosphereColor('#3b9eff')
    .atmosphereAltitude(0.15)
    // 国境ポリゴン：ホバーで国名／地域名がツールチップ表示される。
    // 初期値は空、_loadGlobePolygons() が GeoJSON を非同期取得して差し込む。
    .polygonsData([])
    .polygonCapColor(() => 'rgba(59,158,255,0.04)')
    .polygonSideColor(() => 'rgba(0,0,0,0.05)')
    .polygonStrokeColor(() => 'rgba(140,155,181,0.25)')
    .polygonAltitude(0.006)
    .polygonLabel(d => {
      const name = (d.properties && (d.properties.ADMIN || d.properties.NAME)) || '';
      return _globeLabelHTML(`<b>${name}</b>`);
    })
    // 空港マーカー：count に応じてサイズ・色（hub=amber, normal=red）
    .pointsData([])
    .pointLat('lat').pointLng('lng')
    .pointAltitude(0.01)
    .pointRadius('size')
    .pointColor('color')
    .pointLabel(d =>
      _globeLabelHTML(`<b style="color:#3b9eff">${d.code}</b> — ${d.city}<br>${d.count} flights`))
    // ルート：大圏アーク（球面上の最短経路）
    .arcsData([])
    .arcStartLat('startLat').arcStartLng('startLng')
    .arcEndLat('endLat').arcEndLng('endLng')
    .arcColor(() => 'rgba(59, 158, 255, 0.6)')
    .arcAltitudeAutoScale(0.4)
    .arcStroke(0.4)
    .arcDashLength(0.4)
    .arcDashGap(0.15)
    .arcDashAnimateTime(2500);
  // ゆっくり自動回転
  const controls = _globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  // 国境ポリゴンを背景でロード（初回のみ）
  _loadGlobePolygons();
}

let _globePolygonsLoaded = false;
function _loadGlobePolygons(){
  if(_globePolygonsLoaded || !_globe) return;
  _globePolygonsLoaded = true;
  // Natural Earth 110m の国境 GeoJSON（約 488KB、低解像度だが地球儀には十分）
  // プロパティ：ADMIN（英語の国名）, NAME, CONTINENT 等
  fetch('https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson')
    .then(r => r.json())
    .then(geo => {
      if(_globe && geo && Array.isArray(geo.features)){
        // 南極は形が大きすぎて地球儀の見栄えを損ねるので除外
        _globe.polygonsData(geo.features.filter(f =>
          !f.properties || f.properties.ADMIN !== 'Antarctica'));
      }
    })
    .catch(e => {
      // 失敗してもアプリ全体は動く。コンソール警告だけ出して続行。
      console.warn('Failed to load country polygons for globe:', e);
      _globePolygonsLoaded = false; // 再試行できるよう戻す
    });
}

function renderGlobeData(){
  if(!_globe) return;
  const data = getFiltered();
  const apCount = {};
  data.forEach(f => {
    apCount[f.dep.trim()] = (apCount[f.dep.trim()] || 0) + 1;
    apCount[f.arr.trim()] = (apCount[f.arr.trim()] || 0) + 1;
  });
  // 空港ポイント
  const points = [];
  Object.entries(apCount).forEach(([code, count]) => {
    const a = AP[code];
    if(!a) return;
    const isHub = count >= 10;
    points.push({
      lat: a.lat, lng: a.lng,
      code, city: a.city, count,
      size: isHub ? 0.55 : Math.max(0.25, Math.min(0.5, count * 0.04 + 0.2)),
      color: isHub ? '#ffb020' : '#ff4d6a',
    });
  });
  // ルート：重複除外
  const arcs = [];
  const seen = new Set();
  data.forEach(f => {
    const d = f.dep.trim(), a = f.arr.trim();
    const key = [d, a].sort().join('-');
    if(seen.has(key)) return;
    seen.add(key);
    const p1 = AP[d], p2 = AP[a];
    if(!p1 || !p2) return;
    arcs.push({startLat:p1.lat, startLng:p1.lng, endLat:p2.lat, endLng:p2.lng});
  });
  _globe.pointsData(points).arcsData(arcs);
}

function resizeGlobe(){
  if(!_globe) return;
  const c = document.getElementById('globeContainer');
  _globe.width(c.clientWidth).height(c.clientHeight);
}

// =============================== CHARTS ===============================
let cContinent, cYear, cMonth, cWeekday, cContinentLarge;
// 大陸の配色（インラインと拡大で同一）。隣接ハイライト時に区別できる分散配色。
const CT_COLORS={
  Asia:'#3b9eff',            // 鮮やかな青
  Europe:'#9d7aff',          // 紫
  Oceania:'#00d68f',         // 緑
  'North America':'#ff4d6a', // 赤
  'South America':'#ff8a3d', // オレンジ
  Africa:'#ffd400',          // 黄
  Antarctica:'#b8c5d6',      // 氷のシルバー
};
const chartFont={family:'Outfit',size:11};
const chartGrid={color:'rgba(255,255,255,0.03)'};
const chartTick={color:'#4d5f7a',font:chartFont};

function renderCharts(s){
  // Continent — インライン（小）の doughnut。配色は CT_COLORS で統一。
  const ctxC=document.getElementById('continentChart').getContext('2d');
  if(cContinent) cContinent.destroy();
  const ctTotal=s.ct.reduce((sum,d)=>sum+d[1],0);
  cContinent=new Chart(ctxC,{type:'doughnut',data:{
    labels:s.ct.map(d=>d[0]),
    datasets:[{data:s.ct.map(d=>d[1]),backgroundColor:s.ct.map(d=>CT_COLORS[d[0]]||'#4d5f7a'),borderWidth:0,borderRadius:4,spacing:3}]
  },options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{
    legend:{position:'bottom',labels:{color:'#8c9bb5',font:chartFont,padding:14,usePointStyle:true,pointStyleWidth:8}},
    tooltip:{callbacks:{label:ctx=>{
      const v=ctx.parsed;
      const pct=ctTotal?((v/ctTotal)*100).toFixed(1):'0.0';
      return ` ${v} flights (${pct}%)`;
    }}}
  }}});
  // 拡大表示が開いていれば、同じデータでそちらも更新（フィルタ変更に追従）
  if(document.getElementById('continentsOverlay')?.classList.contains('show')){
    _renderContinentsLargeChart(s.ct);
  }

  // Year
  const years=Object.keys(s.yr).sort();
  const ctxY=document.getElementById('yearChart').getContext('2d');
  if(cYear) cYear.destroy();
  const yColors=['#3b9eff','#9d7aff','#00d68f','#ffb020','#ff4d6a','#00d4ff','#ff8a3d','#ff6b9d'];
  cYear=new Chart(ctxY,{type:'bar',data:{
    labels:years,
    datasets:[{data:years.map(y=>s.yr[y]),backgroundColor:years.map((_,i)=>yColors[i%yColors.length]+'70'),borderColor:years.map((_,i)=>yColors[i%yColors.length]),borderWidth:1.5,borderRadius:5,barPercentage:0.55}]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
    y:{beginAtZero:true,grid:chartGrid,ticks:chartTick},
    x:{grid:{display:false},ticks:{...chartTick,font:{family:'JetBrains Mono',size:11}}}
  }}});

  // Month
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mData=months.map((_,i)=>s.mo[i+1]||0);
  const ctxM=document.getElementById('monthChart').getContext('2d');
  if(cMonth) cMonth.destroy();
  cMonth=new Chart(ctxM,{type:'line',data:{
    labels:months,
    datasets:[{data:mData,borderColor:'#ff4d6a',backgroundColor:'rgba(255,77,106,0.08)',fill:true,tension:0.4,pointRadius:5,pointBackgroundColor:'#ff4d6a',pointBorderColor:'#060b14',pointBorderWidth:2}]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
    y:{beginAtZero:true,grid:chartGrid,ticks:chartTick},
    x:{grid:{display:false},ticks:chartTick}
  }}});

  // Weekday — Mon〜Sun。月と同じ折れ線スタイル。
  const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const wData=weekdays.map((_,i)=>s.wd?.[i]||0);
  const wLine='#00d4ff'; // ライン＆ポイント色（シアン）
  const ctxW=document.getElementById('weekdayChart').getContext('2d');
  if(cWeekday) cWeekday.destroy();
  cWeekday=new Chart(ctxW,{type:'line',data:{
    labels:weekdays,
    datasets:[{
      data:wData,
      borderColor:wLine,
      backgroundColor:'rgba(0,212,255,0.08)',
      fill:true,tension:0.4,
      pointRadius:5,
      pointBackgroundColor:wLine,
      pointBorderColor:'#060b14',pointBorderWidth:2,
    }]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{
    y:{beginAtZero:true,grid:chartGrid,ticks:chartTick},
    x:{grid:{display:false},ticks:{...chartTick,font:{family:'JetBrains Mono',size:11}}}
  }}});
}

// =============================== TABLE ===============================
let sortCol=0,sortAsc=false;
let selectedIds=new Set();
let currentTableData=[];

function renderTable(data){
  currentTableData=data;
  document.getElementById('flightBody').innerHTML=data.map(f=>{
    const checked=selectedIds.has(f.no)?'checked':'';
    const selClass=selectedIds.has(f.no)?'selected':'';
    return `<tr class="${selClass}" id="row-${f.no}">
      <td class="cb-wrap"><input type="checkbox" class="cb" ${checked} onchange="toggleRow(${f.no},this)"></td>
      <td class="date-tag">${f.no}</td>
      <td class="date-tag">${f.date}</td>
      <td class="route-tag">${f.dep} → ${f.arr}</td>
      <td><span class="aircraft-tag">${f.ac}</span></td>
      <td class="airline-tag">${f.al}</td>
      <td class="time-tag">${f.t}</td>
      <td><button class="row-delete-btn" onclick="confirmDeleteOne(${f.no})" title="Delete">✕</button></td>
    </tr>`;
  }).join('');
  updateSelectBar();
}

function toggleRow(no,cb){
  if(cb.checked) selectedIds.add(no); else selectedIds.delete(no);
  const row=document.getElementById('row-'+no);
  if(row) row.classList.toggle('selected',cb.checked);
  updateSelectBar();
  updateHeaderCb();
}

function toggleAll(masterCb){
  if(masterCb.checked){
    currentTableData.forEach(f=>selectedIds.add(f.no));
  } else {
    currentTableData.forEach(f=>selectedIds.delete(f.no));
  }
  renderTable(currentTableData);
  masterCb.classList.remove('partial');
}

function clearSelection(){
  selectedIds.clear();
  const cb=document.getElementById('cbAll');
  if(cb){cb.checked=false;cb.classList.remove('partial');}
  renderTable(currentTableData);
}

function updateSelectBar(){
  const bar=document.getElementById('selectBar');
  const cnt=selectedIds.size;
  if(cnt>0){
    bar.classList.add('show');
    document.getElementById('selCount').textContent=cnt+' selected';
  } else {
    bar.classList.remove('show');
  }
}

function updateHeaderCb(){
  const cb=document.getElementById('cbAll');
  if(!cb) return;
  const total=currentTableData.length;
  const checked=currentTableData.filter(f=>selectedIds.has(f.no)).length;
  if(checked===0){cb.checked=false;cb.classList.remove('partial');}
  else if(checked===total){cb.checked=true;cb.classList.remove('partial');}
  else{cb.checked=false;cb.classList.add('partial');}
}

function sortTable(col){
  if(sortCol===col) sortAsc=!sortAsc; else{sortCol=col;sortAsc=true;}
  const keys=['no','date','dep','ac','al','t'];
  const key=keys[col];
  const d=[...getFiltered()].sort((a,b)=>{
    if(key==='no') return sortAsc?a.no-b.no:b.no-a.no;
    if(key==='t') return sortAsc?parseMin(a.t)-parseMin(b.t):parseMin(b.t)-parseMin(a.t);
    return sortAsc?String(a[key]).localeCompare(String(b[key])):String(b[key]).localeCompare(String(a[key]));
  });
  renderTable(d);
}
function filterFlights(){
  const q=document.getElementById('logSearch').value.toLowerCase();
  const d=getFiltered().filter(f=>
    f.date.includes(q)||f.dep.toLowerCase().includes(q)||f.arr.toLowerCase().includes(q)||
    f.ac.toLowerCase().includes(q)||f.al.toLowerCase().includes(q)||f.t.includes(q)
  );
  renderTable(d);
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
function refreshDirtyBanner(){
  const banner=document.getElementById('dirtyBanner');
  if(!banner) return;
  if(DataSource.dirty && DataSource.count>0){
    document.getElementById('dirtyCount').textContent=DataSource.count;
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
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
    <div class="yoy-prev">${prevLabel}: ${formatter(valB)}</div>
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
    const badge=d.detail?`<span class="ac-detail">${d.detail}</span>`:'';
    return `<div class="ac-item" onmousedown="acSelect('${inputId}','${d.code.replace(/'/g,"\\'")}')">
      <span class="ac-code">${d.code}</span>${badge}
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
      const fixTip=hasFixes?` title="${r.fixes.join(', ')}"`:''
      const statusIcon=hasFixes?'🔧':'✓';
      const statusCol=hasFixes?'var(--cyan)':'var(--green)';
      html+=`<tr><td>${r.date}</td><td style="color:var(--accent);font-weight:600;">${r.dep} → ${r.arr}</td><td>${r.ac}</td><td>${r.al}</td><td>${r.t}</td><td style="color:${statusCol};cursor:${hasFixes?'help':'default'};"${fixTip}>${statusIcon}</td></tr>`;
    } else {
      html+=`<tr class="row-error"><td colspan="5">${r.raw.substring(0,80)}</td><td>${r.reason}</td></tr>`;
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
      html+=`<tr><td style="font-weight:600;color:var(--accent);">${r.icao}</td><td>${r.city}</td><td>${r.co}</td><td>${r.ct}</td><td>${r.lat.toFixed(2)}, ${r.lng.toFixed(2)}</td><td style="color:${colors[r.source]};">${labels[r.source]}</td></tr>`;
    } else {
      html+=`<tr class="row-error"><td colspan="5">${r.raw.substring(0,80)}</td><td>${r.reason}</td></tr>`;
    }
  });
  html+='</tbody></table>';
  preview.innerHTML=html;
  preview.style.display='';
}
