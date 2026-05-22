// =============================== MAIN ===============================
// イベントハンドラ・配線・初期化。
// DOM 操作の起点（onclick/oninput）とフロー制御はここに集約。
// 依存: airports.js / datasource.js / normalize.js / compute.js /
//       parse.js / render.js のすべて。

// =============================== DELETE LOGIC ===============================
let pendingDeleteType=null; // 'selected' | 'all'

function confirmDeleteOne(no){
  const f=flights.find(x=>x.no===no);
  if(!f) return;
  selectedIds.clear();
  selectedIds.add(no);
  pendingDeleteType='selected';
  document.getElementById('confirmTitle').textContent='Delete Flight #'+no+'?';
  document.getElementById('confirmDesc').innerHTML=
    `Remove <strong>${f.dep} → ${f.arr}</strong> on ${f.date} (${f.ac}, ${f.al})?<br>This cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}

function confirmDeleteSelected(){
  const cnt=selectedIds.size;
  if(cnt===0) return;
  pendingDeleteType='selected';
  document.getElementById('confirmTitle').textContent='Delete '+cnt+' Flight'+(cnt>1?'s':'')+'?';
  document.getElementById('confirmDesc').innerHTML=
    `This will permanently remove <strong>${cnt} flight${cnt>1?'s':''}</strong> from your log.<br>This action cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}

function confirmDeleteAll(){
  if(flights.length===0) return;
  pendingDeleteType='all';
  document.getElementById('confirmTitle').textContent='Delete ALL Flights?';
  document.getElementById('confirmDesc').innerHTML=
    `This will permanently remove <strong>all ${flights.length} flights</strong> from your log.<br>This action cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}

function closeConfirm(){
  document.getElementById('confirmOverlay').classList.remove('show');
  document.body.style.overflow='';
  pendingDeleteType=null;
}

function executeDelete(){
  let count=0;
  if(pendingDeleteType==='all'){
    count=DataSource.count;
    DataSource.clearAll();
  } else if(pendingDeleteType==='selected'){
    count=selectedIds.size;
    DataSource.removeByIds([...selectedIds]);
  }
  flights=DataSource.flights;
  selectedIds.clear();
  closeConfirm();
  rebuildYearFilter();
  refreshAll();
  showToast(`🗑️ ${count} flight${count>1?'s':''} deleted`,'red');
}

// =============================== FILTERS ===============================
// rebuildYearFilter is an alias for rebuildFilters (kept for backward compatibility with old call sites)
function rebuildYearFilter(){ rebuildFilters(); }

// 各フィルタの定義。HTML 側の id とは
//   ・チップ:        chip-<key>
//   ・メニュー:      filter<Cap>Menu
//   ・ラベル文言:    filter<Cap>Label
// の規約で対応している（_cap で先頭大文字化）。
const FILTER_DEFS = [
  { key:'year',     stateKey:'years',     all:'All Years',             order:'desc' },
  { key:'airline',  stateKey:'airlines',  all:'All Airlines',          order:'asc'  },
  { key:'aircraft', stateKey:'aircraft',  all:'All Aircraft',          order:'asc'  },
  { key:'country',  stateKey:'countries', all:'All Countries/Regions', order:'asc'  },
];
function _cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function _escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
function _escapeHtml(s){
  return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}

// 現在のフライトデータから、各フィルタで選べる選択肢を返す。
// 年は降順、それ以外は昇順。
function _availableOptions(){
  const years=new Set(), airlines=new Set(), aircraft=new Set(), countries=new Set();
  flights.forEach(f=>{
    years.add(f.date.slice(0,4));
    if(f.al) airlines.add(f.al);
    if(f.ac) aircraft.add(f.ac);
    _flightCountry(f).forEach(c=>countries.add(c));
  });
  return {
    year:     [...years].sort().reverse(),
    airline:  [...airlines].sort(),
    aircraft: [...aircraft].sort(),
    country:  [...countries].sort(),
  };
}

function rebuildFilters(){
  const opts = _availableOptions();
  FILTER_DEFS.forEach(def => _renderFilterMenu(def, opts[def.key]));
  // データから消えた値は FilterState からも除外
  FILTER_DEFS.forEach(def => {
    const valid = new Set(opts[def.key]);
    FilterState[def.stateKey] = FilterState[def.stateKey].filter(v => valid.has(v));
  });
  _syncFilterChips();
}

// 1 つのフィルタについて、現データに含まれる全選択肢のチェックボックス行を描画。
// 選択中の値は checked にする。
function _renderFilterMenu(def, options){
  const menu = document.getElementById('filter'+_cap(def.key)+'Menu');
  if(!menu) return;
  if(options.length===0){
    menu.innerHTML = `<div class="chip-menu-empty">(none)</div>`;
    return;
  }
  const sel = new Set(FilterState[def.stateKey]);
  menu.innerHTML = options.map(v => `
    <label class="chip-menu-item">
      <input type="checkbox" class="cb" data-filter-key="${def.key}" data-filter-value="${_escapeAttr(v)}"${sel.has(v)?' checked':''}>
      <span>${_escapeHtml(v)}</span>
    </label>
  `).join('');
}

// チップに表示するラベル文言。
//   0件:   "All Years" などの全選択ラベル
//   1件:   その値そのもの（"2024"）
//   2件以上: "2024 +N"（残り件数を +N で表す。チップが伸びすぎないように短く）
function _chipLabel(values, allLabel){
  if(values.length===0) return allLabel;
  if(values.length===1) return values[0];
  return values[0] + ' +' + (values.length-1);
}

function _syncFilterChips(){
  FILTER_DEFS.forEach(def => {
    const chip = document.getElementById('chip-'+def.key);
    const lbl  = document.getElementById('filter'+_cap(def.key)+'Label');
    const vals = FilterState[def.stateKey];
    if(chip) chip.classList.toggle('active', vals.length>0);
    if(lbl)  lbl.textContent = _chipLabel(vals, def.all);
  });
  document.getElementById('chip-domestic').classList.toggle('active', FilterState.domesticOnly);
  document.getElementById('chip-international').classList.toggle('active', FilterState.internationalOnly);
  document.getElementById('filterClear').style.display=isAnyFilterActive()?'':'none';
}

// メニュー内チェックボックスの変更をイベントデリゲーションで一括処理。
// （メニューは rebuildFilters で再生成されるので、要素ごとに addEventListener する
//   よりも document レベルで聴く方が安全）
document.addEventListener('change', e => {
  const cb = e.target;
  if(!(cb instanceof HTMLInputElement)) return;
  if(cb.type!=='checkbox') return;
  const key = cb.dataset.filterKey;
  if(!key) return;
  const def = FILTER_DEFS.find(d => d.key===key);
  if(!def) return;
  const value = cb.dataset.filterValue;
  const list = FilterState[def.stateKey];
  if(cb.checked){
    if(!list.includes(value)) list.push(value);
  } else {
    FilterState[def.stateKey] = list.filter(v => v!==value);
  }
  _syncFilterChips();
  _writeFiltersToURL();
  refreshAll();
});

// チップのドロップダウン開閉。クリック伝播は止め、外側クリックハンドラに食われないように。
function toggleFilterMenu(key, e){
  if(e) e.stopPropagation();
  const chip = document.getElementById('chip-'+key);
  const menu = document.getElementById('filter'+_cap(key)+'Menu');
  if(!chip || !menu) return;
  const willOpen = !menu.classList.contains('open');
  // 他のメニューを閉じる
  _closeAllFilterMenus();
  if(willOpen){
    menu.classList.add('open');
    chip.classList.add('open');
  }
}

function _closeAllFilterMenus(){
  document.querySelectorAll('.chip-menu.open').forEach(m => {
    m.classList.remove('open');
    const chip = m.closest('.filter-chip-multi');
    if(chip) chip.classList.remove('open');
  });
}

// 外側クリック / Escape で全部閉じる
document.addEventListener('click', e => {
  if(!e.target.closest('.filter-chip-multi')) _closeAllFilterMenus();
});

// =============================== COMPARE SECTION ===============================
// アンカーカード内の年セレクタが変わったとき。
// CompareState を更新して再描画するだけ（フィルタとは独立 → refreshAll は不要）。
// 同年が選ばれた場合は許容：すべて 0% / ─ で表示されるので「無意味な比較」だと
// 視覚的に分かる。強制的にずらす方が混乱の元。
function onCompareChange(){
  CompareState.yearA = document.getElementById('compareYearA').value;
  CompareState.yearB = document.getElementById('compareYearB').value;
  renderCompare();
}

// 国内線トグル（出発・到着が同じ国/地域のフライトだけ表示）
// International とは互他的：片方を ON にすると他方は OFF になる
function toggleDomesticOnly(){
  FilterState.domesticOnly = !FilterState.domesticOnly;
  if(FilterState.domesticOnly) FilterState.internationalOnly = false;
  _syncFilterChips();
  _writeFiltersToURL();
  refreshAll();
}
// 国際線トグル（出発と到着の国が異なるフライトだけ表示）
function toggleInternationalOnly(){
  FilterState.internationalOnly = !FilterState.internationalOnly;
  if(FilterState.internationalOnly) FilterState.domesticOnly = false;
  _syncFilterChips();
  _writeFiltersToURL();
  refreshAll();
}

function clearFilters(){
  FilterState.years=[]; FilterState.airlines=[]; FilterState.aircraft=[]; FilterState.countries=[];
  FilterState.domesticOnly=false;
  FilterState.internationalOnly=false;
  // チェックボックスの見た目もリセット
  document.querySelectorAll('.chip-menu input[type="checkbox"]').forEach(cb => cb.checked=false);
  _closeAllFilterMenus();
  _syncFilterChips();
  _writeFiltersToURL();
  refreshAll();
}
// URL パラメータは互換のため単数名（year, airline, aircraft, country）のまま、
// 値だけカンマ区切りで複数化（例: ?year=2024,2025&airline=ANA,JAL）。
// 旧形式（単一値）も自動的に 1 要素配列として読み込まれる。
function _writeFiltersToURL(){
  const params=new URLSearchParams();
  if(FilterState.years.length)     params.set('year',     FilterState.years.join(','));
  if(FilterState.airlines.length)  params.set('airline',  FilterState.airlines.join(','));
  if(FilterState.aircraft.length)  params.set('aircraft', FilterState.aircraft.join(','));
  if(FilterState.countries.length) params.set('country',  FilterState.countries.join(','));
  if(FilterState.domesticOnly)     params.set('domestic', '1');
  if(FilterState.internationalOnly) params.set('international', '1');
  const qs=params.toString();
  history.replaceState(null,'',qs?'?'+qs:location.pathname);
}
function _parseCSVParam(raw){
  // 空文字や null は空配列、それ以外はカンマ分割＋trim＋空要素除去
  if(!raw) return [];
  return raw.split(',').map(s=>s.trim()).filter(Boolean);
}
function _readFiltersFromURL(){
  const p=new URLSearchParams(location.search);
  FilterState.years     = _parseCSVParam(p.get('year'));
  FilterState.airlines  = _parseCSVParam(p.get('airline'));
  FilterState.aircraft  = _parseCSVParam(p.get('aircraft'));
  FilterState.countries = _parseCSVParam(p.get('country'));
  FilterState.domesticOnly = p.get('domestic') === '1';
  FilterState.internationalOnly = p.get('international') === '1';
  // 念のため：両方 true は不可能（互他的）。URL 直叩きで両方来た場合は international を優先解除
  if(FilterState.domesticOnly && FilterState.internationalOnly) FilterState.internationalOnly = false;
}

// populateYears is an alias for the unified filter rebuild (kept for backward compatibility)
function populateYears(){ rebuildFilters(); }

// =============================== ADD FLIGHT MODAL ===============================
function openModal(){
  document.getElementById('modalOverlay').classList.add('show');
  document.body.style.overflow='hidden';
  // 開いた直後に Date 欄へフォーカス（アニメ完了を少し待つ）
  setTimeout(()=>{ const f=document.getElementById('fDate'); if(f) f.focus(); }, 80);
}
function closeModal(){document.getElementById('modalOverlay').classList.remove('show');document.body.style.overflow='';}
function addFlight(){
  const date=document.getElementById('fDate').value;
  // 入力の生値を取り、データ境界で必ず正規化する（IATA→ICAO、機材正準コード、エアライン正式名）
  const dep = normalizeAirport(document.getElementById('fDep').value) || '';
  const arr = normalizeAirport(document.getElementById('fArr').value) || '';
  const ac  = normalizeAircraft(document.getElementById('fAircraft').value) || '';
  const al  = normalizeAirline(document.getElementById('fAirline').value) || '';
  let t = document.getElementById('fTime').value.trim();
  if(!date||!dep||!arr||!ac||!al||!t){alert('Please fill in all fields.');return;}
  // Normalize time
  const nt=normalizeTime(t);
  if(nt) t=nt;
  // Auto-resolve airports from AIRPORT_DB
  [dep,arr].forEach(code=>{
    if(!AP[code] && AIRPORT_DB[code]){
      AP[code]=AIRPORT_DB[code];
      DataSource.addAirports({[code]:AIRPORT_DB[code]});
    }
  });
  DataSource.addOne({date,dep,arr,ac,al,t});
  flights=DataSource.flights;
  closeModal();
  rebuildYearFilter();
  refreshAll();
  ['fDate','fDep','fArr','fAircraft','fAirline','fTime'].forEach(id=>document.getElementById(id).value='');
  showToast('✓ Flight added successfully');
}

// =============================== REFRESH ===============================
// Leaflet's map needs a visible container to initialize correctly,
// so we defer map init until the first refresh that has data.
let _mapInited = false;
function ensureMap(){
  if(_mapInited) return;
  initMap();
  _mapInited = true;
}
function refreshAll(){
  refreshEmptyState();
  refreshDirtyBanner();
  if(DataSource.count===0){
    // Nothing to render — empty-state UI handles it
    return;
  }
  ensureMap();
  // If map was already inited but is just becoming visible again, refresh its size
  if(map && map.invalidateSize) map.invalidateSize();
  const data=getFiltered();
  const s=computeAll(data);
  renderStats(data);
  renderBars('aircraftBars',s.ac.slice(0,5),'aircraft', s.acMin);
  renderBars('airlinesBars',s.al.slice(0,5),'airlines', s.alMin);
  renderBars('routesBars',s.rt.slice(0,5),'routes');
  renderBars('airportsBars',s.ap.slice(0,5),'airports');
  renderBars('countriesBars',s.co.slice(0,5),'countries');
  renderBars('citiesBars',s.ci.slice(0,5),'cities');
  renderCharts(s);
  renderTable([...data].reverse());
  renderMap(data);
  renderTopFlightsBars();
  renderCompare();
  _updateFlightLogFooter();
  // Reset toggles
  document.querySelectorAll('.toggle').forEach(t=>{
    t.querySelectorAll('.toggle-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  });
  // Reset header checkbox
  const cbAll=document.getElementById('cbAll');
  if(cbAll){cbAll.checked=false;cbAll.classList.remove('partial');}
  document.getElementById('selectBar').classList.remove('show');
}

// =============================== CSV FILE UPLOAD ===============================
function loadCSVFile(fileInput, mode){
  const file=fileInput.files[0];
  if(!file) return;
  const nameEl=document.getElementById(mode==='airport'?'apCsvFileName':'csvFileName');
  nameEl.textContent=file.name+' ('+Math.round(file.size/1024)+'KB)';
  const reader=new FileReader();
  reader.onload=function(e){
    const text=e.target.result;
    if(mode==='airport'){
      document.getElementById('bulkAirportCSV').value=text;
      previewAirports();
    } else {
      document.getElementById('bulkCSV').value=text;
      previewBulk();
    }
  };
  reader.readAsText(file);
}

// =============================== 3D GLOBE OVERLAY ===============================
// 2D 地図の代替ビューとして 3D 地球儀を表示。データは getFiltered() を共有する。
function openGlobe(){
  if(DataSource.count===0){
    showToast('No flights to show','red');
    return;
  }
  document.getElementById('globeOverlay').classList.add('show');
  document.body.style.overflow='hidden';
  // モーダル CSS アニメ完了後に初期化／リサイズしないと container 寸法が 0 になる
  setTimeout(()=>{
    initGlobe();
    resizeGlobe();
    renderGlobeData();
  }, 250);
}
function closeGlobe(){
  document.getElementById('globeOverlay').classList.remove('show');
  document.body.style.overflow='';
}

// =============================== 2D MAP EXPANDED OVERLAY ===============================
// インラインの 2D 地図と同じ Leaflet を、別インスタンスで拡大ウィンドウ表示する。
// データはインライン地図と共有（renderMap が両方を更新する）。
function openMapExpanded(){
  if(DataSource.count===0){
    showToast('No flights to show','red');
    return;
  }
  document.getElementById('mapOverlay').classList.add('show');
  document.body.style.overflow='hidden';
  // モーダル CSS アニメ完了後に初期化／リサイズしないと container 寸法が 0 になる
  setTimeout(()=>{
    initMapExpanded();
    resizeMapExpanded();
    // 初回はここで初描画、2 回目以降は renderMap 側で同期されているので
    // invalidateSize の後にもう一度 fitBounds させるため再描画する。
    renderMap(getFiltered());
  }, 250);
}
function closeMapExpanded(){
  document.getElementById('mapOverlay').classList.remove('show');
  document.body.style.overflow='';
}

// ウィンドウサイズ変化時に追従
window.addEventListener('resize', ()=>{
  if(document.getElementById('globeOverlay').classList.contains('show')) resizeGlobe();
  if(document.getElementById('mapOverlay').classList.contains('show')) resizeMapExpanded();
});

// =============================== EXPORT DIALOG ===============================
// ユーザーが Flight Log / Custom Airports をそれぞれ選んで DL できる。
// 出力 CSV は DataSource 経由なので、正規化済み（ICAO 4 文字、正式エアライン名等）の
// フォーマットになる。
function openExport(){
  if(DataSource.count===0 && Object.keys(DataSource.customAirports).length===0){
    showToast('Nothing to export','red');
    return;
  }
  const fCount = DataSource.count;
  const aCount = Object.keys(DataSource.customAirports).length;
  document.getElementById('exportFlightsCount').textContent =
    `${fCount} flight${fCount===1?'':'s'}`;
  document.getElementById('exportAirportsCount').textContent =
    `${aCount} airport${aCount===1?'':'s'} added`;
  // 件数 0 はチェック不能・選択不可に
  const fBox = document.getElementById('exportFlights');
  const aBox = document.getElementById('exportAirports');
  fBox.checked  = fCount>0;
  fBox.disabled = fCount===0;
  aBox.checked  = aCount>0;
  aBox.disabled = aCount===0;
  document.getElementById('exportOverlay').classList.add('show');
  document.body.style.overflow='hidden';
}
function closeExport(){
  document.getElementById('exportOverlay').classList.remove('show');
  document.body.style.overflow='';
}
function executeExport(){
  const wantF = document.getElementById('exportFlights').checked;
  const wantA = document.getElementById('exportAirports').checked;
  if(!wantF && !wantA){
    showToast('Select at least one file','red');
    return;
  }
  let n=0;
  if(wantF && DataSource.count>0){
    _download('IF_Flight_Log.csv', buildFlightCSV(DataSource.flights));
    n++;
  }
  if(wantA){
    const custom = DataSource.customAirports;
    if(Object.keys(custom).length>0){
      _download('IF_Airports.csv', buildAirportCSV(custom));
      n++;
    }
  }
  // Flight Log を出した場合のみ dirty フラグをクリア
  if(wantF) DataSource.markClean();
  closeExport();
  if(n>0) showToast(`✓ Exported ${n} file${n>1?'s':''}`);
}

// =============================== BULK IMPORT ===============================
let currentBulkTab = 'flights';

function openBulk(){
  document.getElementById('bulkOverlay').classList.add('show');
  document.body.style.overflow='hidden';
  // Flights タブのテキストエリアへフォーカス
  setTimeout(()=>{
    const ta = currentBulkTab==='airports'
      ? document.getElementById('bulkAirportCSV')
      : document.getElementById('bulkCSV');
    if(ta) ta.focus();
  }, 80);
}
function closeBulk(){
  document.getElementById('bulkOverlay').classList.remove('show');
  document.body.style.overflow='';
  document.getElementById('bulkCSV').value='';
  document.getElementById('bulkAirportCSV').value='';
  document.getElementById('bulkPreview').style.display='none';
  document.getElementById('bulkCount').style.display='none';
  document.getElementById('apBulkPreview').style.display='none';
  document.getElementById('apBulkCount').style.display='none';
  document.getElementById('csvFileName').textContent='';
  document.getElementById('apCsvFileName').textContent='';
  document.getElementById('csvFileInput').value='';
  document.getElementById('apCsvFileInput').value='';
}

function switchBulkTab(tab, btn){
  currentBulkTab = tab;
  btn.parentElement.querySelectorAll('.modal-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('bulkFlightsTab').style.display = tab==='flights' ? '' : 'none';
  document.getElementById('bulkAirportsTab').style.display = tab==='airports' ? '' : 'none';
  document.getElementById('bulkImportBtn').textContent = tab==='flights' ? 'Import Flights' : 'Import Airports';
}

function executeBulkImport(){
  if(currentBulkTab==='flights'){
    const text=document.getElementById('bulkCSV').value;
    const parsed=parseBulkFlights(text);
    const valid=parsed.filter(r=>r.valid);
    if(valid.length===0){alert('No valid flights to import.');return;}
    // Check for unknown airports — auto-resolve from AIRPORT_DB
    const unknownAPs=new Set();
    const autoResolved=new Set();
    valid.forEach(r=>{
      [r.dep, r.arr].forEach(code=>{
        if(!AP[code]){
          if(AIRPORT_DB[code]){
            AP[code]=AIRPORT_DB[code];
            autoResolved.add(code);
          } else {
            unknownAPs.add(code);
          }
        }
      });
    });
    if(autoResolved.size>0){
      DataSource.addAirports(Object.fromEntries([...autoResolved].map(c=>[c,AIRPORT_DB[c]])));
    }
    if(unknownAPs.size>0){
      const proceed=confirm(`⚠️ Unknown airports (not in DB): ${[...unknownAPs].join(', ')}\n\nThese won't appear on the map. You can add them later via Import > Airports tab.\n\nImport anyway?`);
      if(!proceed) return;
    }
    const incoming=valid.map(r=>({date:r.date,dep:r.dep,arr:r.arr,ac:r.ac,al:r.al,t:r.t}));
    // If user is loading the very first batch into an empty dashboard, treat it as a "fresh load"
    // (not dirty) — they haven't modified anything yet, the CSV IS the source of truth.
    const wasEmpty = DataSource.count===0;
    const {added, duplicates} = DataSource.addFlights(incoming, {skipDuplicates:true});
    if(wasEmpty) DataSource.markClean();
    flights=DataSource.flights;
    closeBulk();
    rebuildYearFilter();
    refreshAll();
    let msg = `✓ ${added.length} flight${added.length===1?'':'s'} imported`;
    if(duplicates.length) msg += ` (${duplicates.length} duplicate${duplicates.length===1?'':'s'} skipped)`;
    if(autoResolved.size)  msg += ` · ${autoResolved.size} airport${autoResolved.size===1?'':'s'} auto-added`;
    showToast(msg);
  } else {
    const text=document.getElementById('bulkAirportCSV').value;
    const parsed=parseBulkAirports(text);
    const valid=parsed.filter(r=>r.valid);
    if(valid.length===0){alert('No valid airports to import.');return;}
    const newAPs={};
    valid.forEach(r=>{
      const entry={lat:r.lat,lng:r.lng,city:r.city,co:r.co,ct:r.ct};
      AP[r.icao]=entry;
      newAPs[r.icao]=entry;
    });
    DataSource.addAirports(newAPs);
    closeBulk();
    refreshAll();
    showToast(`✓ ${valid.length} airport${valid.length>1?'s':''} imported`);
  }
}

// =============================== INIT ===============================
// Hook the DataSource dirty-change signal
onDirtyChange = refreshDirtyBanner;

// Warn the user before they navigate away with unsaved changes
window.addEventListener('beforeunload', e=>{
  if(DataSource.dirty && DataSource.count>0){
    e.preventDefault();
    e.returnValue=''; // Modern browsers ignore custom text but require this for the dialog
  }
});

// ESC でアクティブなオーバーレイを閉じる。優先順は「ネストが深い／重要なもの」から。
// 確認ダイアログ → 拡大表示 → 入力モーダル群 の順。
document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape') return;
  // 開いているフィルタメニューがあれば、まずそれを閉じる（モーダルより優先度低）
  if(document.querySelector('.chip-menu.open')){ _closeAllFilterMenus(); return; }
  const isOpen = id => document.getElementById(id).classList.contains('show');
  if(isOpen('confirmOverlay')){ closeConfirm(); return; }
  if(isOpen('expandedOverlay')){ closeExpanded(); return; }
  if(isOpen('exportOverlay')){ closeExport(); return; }
  if(isOpen('globeOverlay')){ closeGlobe(); return; }
  if(isOpen('mapOverlay')){ closeMapExpanded(); return; }
  if(isOpen('continentsOverlay')){ closeContinentsExpanded(); return; }
  if(isOpen('flightsOverlay')){ closeFlightsExpanded(); return; }
  // Flight Log フルスクリーンを閉じる（show クラスではなく .card-fullscreen で判定）
  if(document.querySelector('.card.table-section.card-fullscreen')){ toggleFlightLogFullscreen(); return; }
  if(isOpen('bulkOverlay')){ closeBulk(); return; }
  if(isOpen('modalOverlay')){ closeModal(); return; }
});

// Add Flight モーダルの入力欄で Enter を押したら送信。textarea ではないので
// 改行は不要。Shift+Enter はそのまま。
['fDate','fDep','fArr','fAircraft','fAirline','fTime'].forEach(id=>{
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('keydown', e=>{
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){
      e.preventDefault();
      addFlight();
    }
  });
});

// Bulk Import の送信ショートカット：
//  - textarea 内で入力中: 改行を残すため、Cmd+Enter / Ctrl+Enter のみ送信
//  - textarea 外（モーダル背景や Cancel/Import ボタンも含まない、入力状態ではない時）:
//    そのまま Enter で送信
['bulkCSV','bulkAirportCSV'].forEach(id=>{
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('keydown', e=>{
    if(e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing){
      e.preventDefault();
      executeBulkImport();
    }
  });
});
document.addEventListener('keydown', e=>{
  if(e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  if(!document.getElementById('bulkOverlay').classList.contains('show')) return;
  // 入力中のフォーム要素にフォーカスがあるときは介入しない
  // （Enter の自然な挙動：textarea=改行、button=click、input=submit を尊重）
  const a = document.activeElement;
  if(a && (a.tagName==='TEXTAREA' || a.tagName==='INPUT' || a.tagName==='BUTTON' || a.tagName==='SELECT')) return;
  e.preventDefault();
  executeBulkImport();
});

_readFiltersFromURL();
rebuildFilters();
refreshAll();

// Leaflet tooltip style inject
const tooltipStyle=document.createElement('style');
tooltipStyle.textContent=`.map-tooltip{background:rgba(13,21,32,0.95)!important;border:1px solid #1a2744!important;color:#e8edf5!important;font-family:'Outfit',sans-serif!important;font-size:12px!important;padding:8px 12px!important;border-radius:8px!important;box-shadow:0 8px 32px rgba(0,0,0,0.4)!important;}.map-tooltip::before{border-top-color:rgba(13,21,32,0.95)!important;}.leaflet-tooltip-top::before{border-top-color:rgba(13,21,32,0.95)!important;}`;
document.head.appendChild(tooltipStyle);
