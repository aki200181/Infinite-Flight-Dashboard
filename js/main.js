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
    `Remove <strong>${_escapeHtml(f.dep)} → ${_escapeHtml(f.arr)}</strong> on ${_escapeHtml(f.date)} (${_escapeHtml(f.ac)}, ${_escapeHtml(f.al)})?<br>This cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('show');
  _lockBodyScroll('confirmOverlay');
}

function confirmDeleteSelected(){
  const cnt=selectedIds.size;
  if(cnt===0) return;
  pendingDeleteType='selected';
  document.getElementById('confirmTitle').textContent='Delete '+cnt+' Flight'+(cnt>1?'s':'')+'?';
  document.getElementById('confirmDesc').innerHTML=
    `This will permanently remove <strong>${cnt} flight${cnt>1?'s':''}</strong> from your log.<br>This action cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('show');
  _lockBodyScroll('confirmOverlay');
}

function confirmDeleteAll(){
  if(flights.length===0) return;
  pendingDeleteType='all';
  document.getElementById('confirmTitle').textContent='Delete ALL Flights?';
  document.getElementById('confirmDesc').innerHTML=
    `This will permanently remove <strong>all ${flights.length} flights</strong> from your log.<br>This action cannot be undone.`;
  document.getElementById('confirmOverlay').classList.add('show');
  _lockBodyScroll('confirmOverlay');
}

function closeConfirm(){
  document.getElementById('confirmOverlay').classList.remove('show');
  _unlockBodyScroll('confirmOverlay');
  pendingDeleteType=null;
}

function executeDelete(){
  let count=0;
  if(pendingDeleteType==='all'){
    count=DataSource.count;
    DataSource.clearAll();
    // localStorage も明示的にクリア（Clear All は「全部消す」の意図なので、
    // 次回新セッション時に Restore モーダルが出ないようにする）
    DataSource.clearStorage();
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
// `fixedOptions` を持つ def はデータからではなく固定リストを選択肢として使う（順序もそのまま）。
// {value, label} 形式で value は内部・URL・FilterState で使う ID、label は UI 表示文字列。
const _MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Mon-Sun の表示順（compute.js の wd と一致：Mon=0..Sun=6）
const _WEEKDAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const FILTER_DEFS = [
  { key:'year',     stateKey:'years',     all:'All Years',             order:'desc' },
  { key:'month',    stateKey:'months',    all:'All Months',            order:'asc',
    fixedOptions: _MONTH_LABELS.map((m,i) => ({
      value: String(i+1).padStart(2,'0'),  // '01'..'12'（compute.js 側と一致）
      label: m,
    }))
  },
  { key:'weekday',  stateKey:'weekdays',  all:'All Weekdays',          order:'asc',
    fixedOptions: _WEEKDAY_LABELS.map((w,i) => ({
      value: String(i),  // '0'..'6'（Mon=0..Sun=6）
      label: w,
    }))
  },
  { key:'airline',  stateKey:'airlines',  all:'All Airlines',          order:'asc'  },
  { key:'aircraft', stateKey:'aircraft',  all:'All Aircraft',          order:'asc'  },
  { key:'country',  stateKey:'countries', all:'All Countries/Regions', order:'asc'  },
  { key:'scope',    stateKey:'scope',     all:'All Flights',           order:'asc',
    fixedOptions:[
      { value:'domestic',      label:'🏠 Domestic' },
      { value:'international', label:'🌎 International' },
    ]
  },
];
function _cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
// _escapeHtml / _escapeAttr は render.js（共通ユーティリティ）側で定義済み

// 現在のフライトデータから、各フィルタで選べる選択肢を返す。
// 年は降順、それ以外は昇順。fixedOptions を持つ def はデータに依存しないので、
// 別経路で渡す（_renderFilterMenu 側で def.fixedOptions を直接読む）。
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
  FILTER_DEFS.forEach(def => {
    // fixedOptions を持つ def は固定値（{value,label}[]）、無ければデータ由来の string[]
    const options = def.fixedOptions || opts[def.key] || [];
    _renderFilterMenu(def, options);
    // データから消えた値は FilterState からも除外（fixedOptions の場合はデータに依存しないのでスキップ）
    if(!def.fixedOptions){
      const valid = new Set(options);
      FilterState[def.stateKey] = FilterState[def.stateKey].filter(v => valid.has(v));
    }
  });
  _syncFilterChips();
}

// 1 つのフィルタについて、選択肢のチェックボックス行を描画。
// options は string[]（データ由来）か {value,label}[]（fixedOptions 由来）のどちらか。
function _renderFilterMenu(def, options){
  const menu = document.getElementById('filter'+_cap(def.key)+'Menu');
  if(!menu) return;
  if(options.length===0){
    menu.innerHTML = `<div class="chip-menu-empty">(none)</div>`;
    return;
  }
  const sel = new Set(FilterState[def.stateKey]);
  menu.innerHTML = options.map(opt => {
    const value = typeof opt === 'object' ? opt.value : opt;
    const label = typeof opt === 'object' ? opt.label : opt;
    return `
    <label class="chip-menu-item">
      <input type="checkbox" class="cb" data-filter-key="${def.key}" data-filter-value="${_escapeAttr(value)}"${sel.has(value)?' checked':''}>
      <span>${_escapeHtml(label)}</span>
    </label>
  `;
  }).join('');
}

// チップに表示するラベル文言。
//   0件:   "All Years" などの全選択ラベル
//   1件:   その値そのもの（"2024" / fixedOptions なら label を引く）
//   2件以上: "2024 +N"（残り件数を +N で表す。チップが伸びすぎないように短く）
function _chipLabel(def, values){
  if(values.length===0) return def.all;
  const first = def.fixedOptions
    ? (def.fixedOptions.find(o => o.value === values[0])?.label || values[0])
    : values[0];
  if(values.length===1) return first;
  return first + ' +' + (values.length-1);
}

function _syncFilterChips(){
  FILTER_DEFS.forEach(def => {
    const chip = document.getElementById('chip-'+def.key);
    const lbl  = document.getElementById('filter'+_cap(def.key)+'Label');
    const vals = FilterState[def.stateKey];
    if(chip) chip.classList.toggle('active', vals.length>0);
    if(lbl)  lbl.textContent = _chipLabel(def, vals);
  });
  document.getElementById('filterClear').style.display=isAnyFilterActive()?'':'none';
  // 折り畳み時にも「適用中のフィルター数」を知らせる小バッジを更新
  _updateFilterActiveBadge();
}

// 適用中のフィルター総数を計算（各 def の選択値数の合計）。
// バー折り畳み時に「Filters ▾ 3」のような形で出すための数値。
function _updateFilterActiveBadge(){
  const badge=document.getElementById('filterActiveBadge');
  if(!badge) return;
  let n = 0;
  FILTER_DEFS.forEach(def => { n += (FilterState[def.stateKey]?.length || 0); });
  if(n>0){ badge.textContent=n; badge.style.display=''; }
  else   { badge.style.display='none'; }
}

// 「Filters ▾」トグル。`.filter-bar.collapsed` の切り替えだけ。
// フィルター適用中でも勝手に展開しない（適用は左の数値バッジで知らせる）。
function toggleFilterBar(){
  document.getElementById('filterBar').classList.toggle('collapsed');
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
// ユーザーが同年を選んだ場合は renderCompare 側で別年に自動でずらす
// （同年比較は全項目 0% / ─ になるだけで無意味なため）。
function onCompareChange(){
  CompareState.yearA = document.getElementById('compareYearA').value;
  CompareState.yearB = document.getElementById('compareYearB').value;
  renderCompare();
}

function clearFilters(){
  FILTER_DEFS.forEach(def => { FilterState[def.stateKey] = []; });
  // チェックボックスの見た目もリセット
  document.querySelectorAll('.chip-menu input[type="checkbox"]').forEach(cb => cb.checked=false);
  _closeAllFilterMenus();
  _syncFilterChips();
  _writeFiltersToURL();
  refreshAll();
}
// URL パラメータは単数名（year, month, weekday, airline, aircraft, country, scope）、値はカンマ区切り。
// 例: ?year=2024,2025&month=07,12&weekday=5,6&airline=ANA,JAL&scope=domestic
// 旧 domestic=1 / international=1 形式は廃止（単一ユーザー想定・後方互換なし）。
function _writeFiltersToURL(){
  const params=new URLSearchParams();
  if(FilterState.years.length)     params.set('year',     FilterState.years.join(','));
  if(FilterState.months.length)    params.set('month',    FilterState.months.join(','));
  if(FilterState.weekdays.length)  params.set('weekday',  FilterState.weekdays.join(','));
  if(FilterState.airlines.length)  params.set('airline',  FilterState.airlines.join(','));
  if(FilterState.aircraft.length)  params.set('aircraft', FilterState.aircraft.join(','));
  if(FilterState.countries.length) params.set('country',  FilterState.countries.join(','));
  if(FilterState.scope.length)     params.set('scope',    FilterState.scope.join(','));
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
  // scope は 'domestic' / 'international' のみ受け付ける（不正値は無視）
  const validScope = new Set(['domestic', 'international']);
  FilterState.scope = _parseCSVParam(p.get('scope')).filter(v => validScope.has(v));
  // month は '01'..'12' のゼロ埋め文字列のみ受け付ける（fixedOptions の value と合わせる）
  const validMonths = new Set(_MONTH_LABELS.map((_,i) => String(i+1).padStart(2,'0')));
  FilterState.months = _parseCSVParam(p.get('month')).filter(v => validMonths.has(v));
  // weekday は '0'..'6' のみ受け付ける（Mon=0..Sun=6）
  const validWeekdays = new Set(['0','1','2','3','4','5','6']);
  FilterState.weekdays = _parseCSVParam(p.get('weekday')).filter(v => validWeekdays.has(v));
}

// populateYears is an alias for the unified filter rebuild (kept for backward compatibility)
function populateYears(){ rebuildFilters(); }

// =============================== ADD FLIGHT MODAL ===============================
function openModal(){
  document.getElementById('modalOverlay').classList.add('show');
  _lockBodyScroll('modalOverlay');
  // 開いた直後に Date 欄へフォーカス（アニメ完了を少し待つ）
  setTimeout(()=>{ const f=document.getElementById('fDate'); if(f) f.focus(); }, 80);
}
function closeModal(){document.getElementById('modalOverlay').classList.remove('show');_unlockBodyScroll('modalOverlay');}
function addFlight(){
  const date=document.getElementById('fDate').value;
  // 入力の生値を取り、データ境界で必ず正規化する（IATA→ICAO、機材正準コード、エアライン正式名）
  const dep = normalizeAirport(document.getElementById('fDep').value) || '';
  const arr = normalizeAirport(document.getElementById('fArr').value) || '';
  const ac  = normalizeAircraft(document.getElementById('fAircraft').value) || '';
  const al  = normalizeAirline(document.getElementById('fAirline').value) || '';
  // Flight Time：分離入力（h／m）を結合してから normalizeTime に通す。
  // h は >23 も許容（直接入力）、m は 0〜59 を厳格チェック。空欄は 0 扱い。
  const rawH = document.getElementById('fTimeH').value.trim();
  const rawM = document.getElementById('fTimeM').value.trim();
  const h = rawH==='' ? 0 : parseInt(rawH, 10);
  const m = rawM==='' ? 0 : parseInt(rawM, 10);
  if(isNaN(h) || isNaN(m) || h<0 || m<0){ alert('Flight time must be non-negative numbers.'); return; }
  if(m > 59){ alert('Minutes must be 0–59 (use the hour field for full hours).'); return; }
  if(!date||!dep||!arr||!ac||!al || (h===0 && m===0)){
    alert('Please fill in all fields.');
    return;
  }
  // 正準形 "Xh{padded2}m" に組み立て → normalize 経由で確実に canonical 化
  const combined = `${h}h${String(m).padStart(2,'0')}m`;
  let t = normalizeTime(combined) || combined;
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
  ['fDate','fDep','fArr','fAircraft','fAirline','fTimeH','fTimeM'].forEach(id=>document.getElementById(id).value='');
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

// =============================== THEME (LIGHT / DARK / AUTO) ===============================
// localStorage には 'auto' / 'light' / 'dark' の3値を保存。
// 'auto' は OS の prefers-color-scheme に追従し、OS 設定の変更にもリアルタイム反映する。
// 切替はヘッダの ☀️/🌙/🔄 ボタンから toggleTheme() で：auto → light → dark → auto の順に巡回。
// テーマは <html data-theme="..."> に反映（CSS の :root はダーク、[data-theme="light"] で上書き）。
//
// アイコンの意味（状態オーナー型：今の状態を表示）：
//   ☀️ = Light 固定 / 🌙 = Dark 固定 / 🔄 = Auto（OS追従）
// 次に切替わる先は title 属性（hover）に表示。
const _THEME_KEY = 'if-dashboard:theme:v1';
const _THEME_CYCLE = ['auto','light','dark'];
const _THEME_LABELS = { auto:'Auto (follow OS)', light:'Light', dark:'Dark' };

// localStorage から保存値（'auto'/'light'/'dark'）を取得。未保存・不正値は 'auto'。
function _resolveStoredTheme(){
  try {
    const saved = localStorage.getItem(_THEME_KEY);
    if(_THEME_CYCLE.includes(saved)) return saved;
  } catch(e){ /* fallthrough */ }
  return 'auto';
}

// OS が light を要求しているか（matchMedia 未対応環境では false → dark にフォールバック）
function _osPrefersLight(){
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
}

// 保存値（auto含む）→ 実際に適用するテーマ（light/dark のみ）に解決
function _resolveEffectiveTheme(stored){
  if(stored === 'auto') return _osPrefersLight() ? 'light' : 'dark';
  return stored;
}

// 現在の保存値に応じてボタンアイコン＆ツールチップを更新
function _updateThemeButton(stored){
  const icon = document.getElementById('themeToggleIcon');
  if(icon) icon.textContent = stored === 'auto' ? '🔄' : (stored === 'light' ? '☀️' : '🌙');
  const btn = document.getElementById('themeToggle');
  if(btn){
    const next = _THEME_CYCLE[(_THEME_CYCLE.indexOf(stored) + 1) % _THEME_CYCLE.length];
    btn.title = `Theme: ${_THEME_LABELS[stored]} · click for ${_THEME_LABELS[next]}`;
  }
}

// 描画系（Chart.js / Leaflet / Globe / バー等）を新しい CSS 変数で再適用
function _refreshThemeDependentRenders(){
  if(typeof applyMapTheme === 'function') applyMapTheme();
  if(typeof applyGlobeTheme === 'function') applyGlobeTheme();
  if(DataSource && DataSource.count > 0) refreshAll();
}

function applyTheme(stored){
  // 永続化（失敗しても致命的ではない）
  try { localStorage.setItem(_THEME_KEY, stored); } catch(e){}
  // 実テーマを反映
  document.documentElement.dataset.theme = _resolveEffectiveTheme(stored);
  _updateThemeButton(stored);
  _refreshThemeDependentRenders();
}

function toggleTheme(){
  const cur = _resolveStoredTheme();
  const next = _THEME_CYCLE[(_THEME_CYCLE.indexOf(cur) + 1) % _THEME_CYCLE.length];
  applyTheme(next);
}

// OS のテーマ設定変更を監視。保存値が 'auto' のときだけリアルタイム追従。
// 'light'/'dark' 固定中は OS が変わってもユーザーの明示的選択を尊重し、無反応。
function _watchOsThemeChanges(){
  if(!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if(_resolveStoredTheme() === 'auto'){
      document.documentElement.dataset.theme = _resolveEffectiveTheme('auto');
      _refreshThemeDependentRenders();
    }
  };
  // 古い Safari 互換：addEventListener 未対応なら addListener にフォールバック
  if(mq.addEventListener) mq.addEventListener('change', handler);
  else if(mq.addListener) mq.addListener(handler);
}

// 初期化：DOM 完成前に <html data-theme> を立てて FOUC（一瞬の白チラ）を防ぐ。
// アイコン更新＆OS監視は DOMContentLoaded 後にセットアップ。
(function _bootstrapTheme(){
  const stored = _resolveStoredTheme();
  document.documentElement.dataset.theme = _resolveEffectiveTheme(stored);
  document.addEventListener('DOMContentLoaded', () => {
    _updateThemeButton(stored);
    _watchOsThemeChanges();
  });
})();

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
  _lockBodyScroll('globeOverlay');
  // モーダル CSS アニメ完了後に初期化／リサイズしないと container 寸法が 0 になる
  setTimeout(()=>{
    initGlobe();
    resizeGlobe();
    renderGlobeData();
  }, 250);
}
function closeGlobe(){
  document.getElementById('globeOverlay').classList.remove('show');
  _unlockBodyScroll('globeOverlay');
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
  _lockBodyScroll('mapOverlay');
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
  _unlockBodyScroll('mapOverlay');
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
  // プレフィックス入力欄に保存値（または既定値）をセット → 末尾の日付プレビューも更新
  document.getElementById('exportFlightsPrefix').value  = getExportPrefix('flights');
  document.getElementById('exportAirportsPrefix').value = getExportPrefix('airports');
  _updateExportFilenamePreviews();
  document.getElementById('exportOverlay').classList.add('show');
  _lockBodyScroll('exportOverlay');
}

// 各プレフィックス入力の末尾に「_YYYY-MM-DD.csv」のプレビューを表示する。
// 入力時 (oninput) からも呼ばれる。
function _updateExportFilenamePreviews(){
  const fInput = document.getElementById('exportFlightsPrefix');
  const aInput = document.getElementById('exportAirportsPrefix');
  const fPrev  = document.getElementById('exportFlightsPreview');
  const aPrev  = document.getElementById('exportAirportsPreview');
  if(fInput && fPrev) fPrev.textContent = buildExportFilename(fInput.value);
  if(aInput && aPrev) aPrev.textContent = buildExportFilename(aInput.value);
}
function onExportPrefixInput(){ _updateExportFilenamePreviews(); }
function closeExport(){
  document.getElementById('exportOverlay').classList.remove('show');
  _unlockBodyScroll('exportOverlay');
}
function executeExport(){
  const wantF = document.getElementById('exportFlights').checked;
  const wantA = document.getElementById('exportAirports').checked;
  if(!wantF && !wantA){
    showToast('Select at least one file','red');
    return;
  }
  // 入力されたプレフィックスを localStorage に保存（次回のエクスポートに引き継ぐ）
  const fPrefixRaw = document.getElementById('exportFlightsPrefix').value;
  const aPrefixRaw = document.getElementById('exportAirportsPrefix').value;
  setExportPrefix('flights',  fPrefixRaw);
  setExportPrefix('airports', aPrefixRaw);
  let n=0;
  if(wantF && DataSource.count>0){
    _download(buildExportFilename(fPrefixRaw || EXPORT_PREFIX_DEFAULTS.flights),
              buildFlightCSV(DataSource.flights));
    n++;
  }
  if(wantA){
    const custom = DataSource.customAirports;
    if(Object.keys(custom).length>0){
      _download(buildExportFilename(aPrefixRaw || EXPORT_PREFIX_DEFAULTS.airports),
                buildAirportCSV(custom));
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
  _lockBodyScroll('bulkOverlay');
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
  _unlockBodyScroll('bulkOverlay');
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
// Hook for auto-save event（保存成功時 / 失敗時にアイコン状態を更新）
onAutoSave = _onAutoSave;
onAutoSaveError = _onAutoSaveError;

// 自動保存が走った直後に呼ばれる。アイコンを「OK」状態に維持しつつ、
// 上部の通知バナーで「✓ Auto-saved」を 10 秒表示（連続発火は間引き）。
let _lastSavedNotifyAt = 0;
function _onAutoSave(){
  _setSaveStatus('ok');
  // データが 0 件になった瞬間（Clear All 等）は通知バナーを出さない。
  // 直後に restore モーダル/empty state へ遷移するため、緑バナーが一瞬出るのが不自然。
  if(DataSource.count === 0) return;
  const now = Date.now();
  // 同じ操作内で連続発火する場合があるので、500ms 以内は間引く
  if(now - _lastSavedNotifyAt < 500) return;
  _lastSavedNotifyAt = now;
  showNotifyBanner('success', 'Auto-saved on this device · CSV backup recommended');
}

// 保存失敗時：アイコンを警告状態に切り替え + 赤バナーを ✕ で閉じるまで常設表示。
function _onAutoSaveError(_err){
  if(!DataSource.isStorageAvailable()){
    _setSaveStatus('disabled');
    showNotifyBanner('error',
      'Auto-save is not available on this device. Your data exists only in memory and will be lost on close. ' +
      'Open via GitHub Pages or a local HTTP server, and back up via CSV Export.',
      { persistent: true });
  } else {
    _setSaveStatus('error');
    showNotifyBanner('error',
      'Failed to auto-save (storage may be full or restricted). Please export to CSV as a backup.',
      { persistent: true });
  }
}

// =============================== NOTIFY BANNER ===============================
// 上部スティッキーバナー。緑（成功）は 10 秒で自動消滅、赤（エラー）は ✕ で閉じるまで常設。
let _notifyTimer = null;
function showNotifyBanner(variant, message, opts){
  const banner = document.getElementById('notifyBanner');
  const msg = document.getElementById('notifyMsg');
  if(!banner || !msg) return;
  // 直前のタイマーをクリアして上書き
  if(_notifyTimer){ clearTimeout(_notifyTimer); _notifyTimer = null; }
  msg.textContent = message;
  banner.classList.remove('notify-error');
  if(variant === 'error'){
    banner.classList.add('notify-error');
  }
  banner.classList.add('show');
  // success は 10 秒で自動消滅、error は ✕ で閉じるまで常設
  const persistent = opts && opts.persistent;
  if(!persistent){
    _notifyTimer = setTimeout(() => closeNotifyBanner(), 10000);
  }
}
function closeNotifyBanner(){
  const banner = document.getElementById('notifyBanner');
  if(banner) banner.classList.remove('show');
  if(_notifyTimer){ clearTimeout(_notifyTimer); _notifyTimer = null; }
}

// =============================== SAVE STATUS INFO MODAL ===============================
// ヘッダの保存ステータスアイコンをクリックしたときに開く案内ポップアップ。
// 現在の状態（OK / error / disabled）に応じてアイコン色・タイトル・本文を切り替える。
function openSaveStatusInfo(){
  const overlay = document.getElementById('saveStatusOverlay');
  const box     = document.getElementById('saveStatusBox');
  const glyph   = document.getElementById('saveStatusInfoGlyph');
  const title   = document.getElementById('saveStatusInfoTitle');
  const desc    = document.getElementById('saveStatusInfoDesc');
  const note    = document.getElementById('saveStatusInfoNote');
  if(!overlay || !box) return;
  box.classList.remove('is-error', 'is-disabled');

  if(!DataSource.isStorageAvailable()){
    box.classList.add('is-disabled');
    glyph.textContent = '○';
    title.textContent = 'Auto-save unavailable';
    desc.innerHTML = "This browser blocks storage in the current environment "
                  + '(typically <strong>file://</strong> direct-open).<br>'
                  + 'Open via GitHub Pages or a local HTTP server '
                  + '(<code>python3 -m http.server</code>) for auto-save to work.';
    note.textContent = 'Your data exists only in memory until you export to CSV.';
  } else if(document.getElementById('saveStatus').classList.contains('is-error')){
    box.classList.add('is-error');
    glyph.textContent = '!';
    title.textContent = 'Auto-save failed';
    desc.innerHTML = 'The last save attempt failed. Storage may be <strong>full</strong>, '
                  + 'or restricted by the browser.<br>'
                  + 'Please back up your data via CSV Export.';
    note.textContent = 'Newer changes may not be persisted.';
  } else {
    glyph.textContent = '✓';
    title.textContent = 'Auto-saved';
    desc.innerHTML = 'Your flights are automatically saved to this device\'s storage.<br>'
                   + '<strong>CSV backup recommended</strong> for safety.';
    note.textContent = 'Saved on your device · not sent anywhere.';
  }
  overlay.classList.add('show');
  _lockBodyScroll('saveStatusOverlay');
}
function closeSaveStatusInfo(){
  document.getElementById('saveStatusOverlay').classList.remove('show');
  _unlockBodyScroll('saveStatusOverlay');
}

// ヘッダ右の保存ステータスアイコン（旧 dirty-banner の代替）を状態に応じて切り替える。
// state: 'ok' | 'error' | 'disabled'
function _setSaveStatus(state){
  const btn = document.getElementById('saveStatus');
  const icon = document.getElementById('saveStatusIcon');
  if(!btn || !icon) return;
  btn.classList.remove('is-error', 'is-disabled');
  if(state === 'error'){
    btn.classList.add('is-error');
    icon.textContent = '!';
    btn.title = 'Failed to auto-save · click to back up as CSV right now';
  } else if(state === 'disabled'){
    btn.classList.add('is-disabled');
    icon.textContent = '○';
    btn.title = "Auto-save isn't available here (try GitHub Pages or a local HTTP server) · click to back up as CSV";
  } else {
    icon.textContent = '✓';
    btn.title = 'Auto-saved on this device · click to back up as CSV';
  }
}

// =============================== RESTORE MODAL ===============================
// 新セッション（タブ閉じ後の再アクセス）で localStorage にデータがある時のみ表示。
// リフレッシュ時は表示せず黙って自動復元する（_bootstrap で分岐）。
function showRestoreModal(summary){
  const overlay = document.getElementById('restoreOverlay');
  if(!overlay) return;
  document.getElementById('restoreCount').textContent = summary.count;
  // 保存時刻：今日なら "today at HH:mm"、昨日なら "yesterday at HH:mm"、それ以外は "YYYY-MM-DD at HH:mm"
  const savedAtWrap = document.getElementById('restoreSavedAtWrap');
  if(summary.savedAt instanceof Date && !isNaN(summary.savedAt)){
    document.getElementById('restoreSavedAt').textContent = _formatSavedAt(summary.savedAt);
    savedAtWrap.style.display = '';
  } else {
    savedAtWrap.style.display = 'none';
  }
  overlay.classList.add('show');
  _lockBodyScroll('restoreOverlay');
}

// 保存時刻を人間に優しい形式に整形：
//   今日:   "today at 14:32"
//   昨日:   "yesterday at 14:32"
//   それ以外: "2026-05-21 at 14:32"
function _formatSavedAt(d){
  const pad = n => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if(dayDiff === 0) return `today at ${time}`;
  if(dayDiff === 1) return `yesterday at ${time}`;
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} at ${time}`;
}
function _hideRestoreModal(){
  document.getElementById('restoreOverlay').classList.remove('show');
  _unlockBodyScroll('restoreOverlay');
}

// [Restore] ボタン：localStorage から復元してダッシュボードを描画
async function restoreFromStorage(){
  _hideRestoreModal();
  const ok = await DataSource.load();
  if(ok){
    // load() 内では参照を維持しているので不要だが、防御的に再代入しておく
    flights = DataSource.flights;
    rebuildFilters();
    refreshAll();
    showToast(`✓ Restored ${DataSource.count} flights`);
  } else {
    showToast('No data to restore', 'red');
  }
}

// [Start fresh] ボタン：localStorage は消さず、モーダルだけ閉じる。
// 次回新セッション時にまた同じモーダルが出る（PLAN.md の B-2 仕様通り）。
// 明示的に削除したい場合はヘッダの 🗑 Clear ボタン経由。
function startFreshKeepStorage(){
  _hideRestoreModal();
  // _bootstrap がモーダル表示時に refreshAll をスキップしているので、ここで明示的に呼ぶ。
  // データはメモリ上ゼロのままなので空状態カードが描画される。
  refreshAll();
}

// ESC でアクティブなオーバーレイを閉じる。優先順は「ネストが深い／重要なもの」から。
// 確認ダイアログ → 拡大表示 → 入力モーダル群 の順。
document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape') return;
  // 開いているフィルタメニューがあれば、まずそれを閉じる（モーダルより優先度低）
  if(document.querySelector('.chip-menu.open')){ _closeAllFilterMenus(); return; }
  const isOpen = id => document.getElementById(id).classList.contains('show');
  if(isOpen('confirmOverlay')){ closeConfirm(); return; }
  if(isOpen('saveStatusOverlay')){ closeSaveStatusInfo(); return; }
  if(isOpen('expandedOverlay')){ closeExpanded(); return; }
  if(isOpen('exportOverlay')){ closeExport(); return; }
  if(isOpen('globeOverlay')){ closeGlobe(); return; }
  if(isOpen('mapOverlay')){ closeMapExpanded(); return; }
  if(isOpen('continentsOverlay')){ closeContinentsExpanded(); return; }
  if(isOpen('yearOverlay')){ closeYearExpanded(); return; }
  if(isOpen('monthOverlay')){ closeMonthExpanded(); return; }
  if(isOpen('weekdayOverlay')){ closeWeekdayExpanded(); return; }
  if(isOpen('flightsOverlay')){ closeFlightsExpanded(); return; }
  // Flight Log フルスクリーンを閉じる（show クラスではなく .card-fullscreen で判定）
  if(document.querySelector('.card.table-section.card-fullscreen')){ toggleFlightLogFullscreen(); return; }
  if(isOpen('bulkOverlay')){ closeBulk(); return; }
  if(isOpen('modalOverlay')){ closeModal(); return; }
});

// Add Flight モーダルの入力欄で Enter を押したら送信。textarea ではないので
// 改行は不要。Shift+Enter はそのまま。
['fDate','fDep','fArr','fAircraft','fAirline','fTimeH','fTimeM'].forEach(id=>{
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

// =============================== BOOTSTRAP ===============================
// sessionStorage の存在で「同セッション内のリフレッシュ」か「新セッション」かを判定。
//   - 新セッション + データあり → Restore モーダル表示
//   - リフレッシュ + データあり → 黙って自動復元
//   - データなし → 何もしない（空状態 UI が出る）
async function _bootstrap(){
  _readFiltersFromURL();
  // フィルタ UI を先に組み立てる（データ復元前でも空メニューを描画しておく）
  rebuildFilters();

  // 起動時にストレージが使えない（file:// 制限など）なら、ヘッダアイコンを最初から disabled に。
  // 起動直後に赤バナーで案内（データを追加する前に「保存できない環境」と知らせる）。
  if(!DataSource.isStorageAvailable()){
    _setSaveStatus('disabled');
    showNotifyBanner('error',
      'Auto-save is not available on this device. Open via GitHub Pages or a local HTTP server, and back up via CSV Export.',
      { persistent: true });
  }

  // sessionStorage 自体が使えない環境では isNewSession が常に true になり、
  // データもないので Restore モーダルは出ない（実害なし）。
  let isNewSession = true;
  try {
    isNewSession = !sessionStorage.getItem(_SESSION_FLAG_KEY);
    sessionStorage.setItem(_SESSION_FLAG_KEY, '1');
  } catch(e) { /* ignore */ }

  if(DataSource.hasStoredData()){
    if(isNewSession){
      const summary = DataSource.storedDataSummary();
      if(summary){
        showRestoreModal(summary);
        // モーダル表示中はデータゼロの状態を裏で出さないよう refreshAll はスキップ。
        // ボタンクリック後に restoreFromStorage / startFreshKeepStorage がそれぞれ refreshAll を呼ぶ。
        return;
      }
    } else {
      // リフレッシュ：黙って復元してフィルタ UI も再構築
      await DataSource.load();
      flights = DataSource.flights; // 防御的に参照再取得
      rebuildFilters();
    }
  }

  refreshAll();
}
_bootstrap();

// Leaflet tooltip style inject
const tooltipStyle=document.createElement('style');
tooltipStyle.textContent=`.map-tooltip{background:rgba(13,21,32,0.95)!important;border:1px solid #1a2744!important;color:#e8edf5!important;font-family:'Outfit',sans-serif!important;font-size:12px!important;padding:8px 12px!important;border-radius:8px!important;box-shadow:0 8px 32px rgba(0,0,0,0.4)!important;}.map-tooltip::before{border-top-color:rgba(13,21,32,0.95)!important;}.leaflet-tooltip-top::before{border-top-color:rgba(13,21,32,0.95)!important;}`;
document.head.appendChild(tooltipStyle);
