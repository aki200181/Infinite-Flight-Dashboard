// =============================== RENDER · MAP & GLOBE ===============================
// 2D 地図（Leaflet）と 3D 地球儀（Globe.gl）の描画。
// 依存: L (Leaflet CDN), Globe (Globe.gl CDN),
//       AP (airports.js), getFiltered (compute.js)
//
// 将来の地図 API 切替（Cesium / Mapbox GL / MapLibre 等）に備えて、外部から呼ばれる
// 「公開 API」は以下に限定する：
//   - initMap(), renderMap(data)                       … インライン 2D 地図
//   - initMapExpanded(), resizeMapExpanded()           … 拡大ウィンドウの 2D 地図
//   - initGlobe(), renderGlobeData(), resizeGlobe()    … 3D 地球儀
// 内部実装（Leaflet / Globe.gl 固有の API 呼び出し）はこのファイル内に閉じ込め、
// 上記公開関数のシグネチャを保ったまま別 API に差し替えられる構造を維持する。
// → 切替時は本ファイルの中身だけ書き換えれば良く、main.js / render.js は無修正。

// =============================== MAP ===============================
// インラインの 2D 地図と、Map header の「🔍 Expand」で開く拡大ウィンドウ用の
// 2 つめの Leaflet インスタンスを並行して持つ。両者は同じ getFiltered() データを
// 共有し、_drawMapLayers ヘルパで同じ描画ロジックを使う。
let map, routeLines=[], markers=[];
let mapExpanded=null, routeLinesExpanded=[], markersExpanded=[];
// 現在マップに乗っている Carto タイルレイヤー参照（テーマ切替時に差し替えるため）
let _mapTileLayer = null, _mapExpandedTileLayer = null;

// 現在のテーマに対応する Carto タイル URL（dark_all / light_all）。CSS 変数 --map-tile-style から決定。
function _currentTileUrl(){
  const style = cssVar('--map-tile-style') === 'light' ? 'light_all' : 'dark_all';
  return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
}

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
  // タイル：dark_all / light_all は国名・都市名のラベル入り（ズームで詳細度が上がる）。
  // ※ 太平洋中心レイアウトの副作用で低ズーム時に世界が左右に繰り返し表示される。
  //   3D 地球ボタンで Globe.gl の地球儀ビューに切り替え可能。
  const tile = L.tileLayer(_currentTileUrl(), {
    subdomains:'abcd', maxZoom:18,
    noWrap:false,
  }).addTo(m);
  return { map: m, tile };
}

function initMap(){
  const r = _createMapAt('flightMap');
  map = r.map; _mapTileLayer = r.tile;
  _addGeoLinesToMap(map);
}

// 拡大ウィンドウ用の Leaflet インスタンスを遅延初期化。
// 初回 openMapExpanded() で一度だけ呼ばれる。
function initMapExpanded(){
  if(mapExpanded) return;
  const r = _createMapAt('flightMapExpanded');
  mapExpanded = r.map; _mapExpandedTileLayer = r.tile;
  _addGeoLinesToMap(mapExpanded);
}

// テーマ切替時に Leaflet タイル URL を差し替え（dark_all ↔ light_all）。
// 既存タイルレイヤーを map から外し、新しい URL で作り直す。
function applyMapTheme(){
  const url = _currentTileUrl();
  if(map && _mapTileLayer){
    map.removeLayer(_mapTileLayer);
    _mapTileLayer = L.tileLayer(url, {subdomains:'abcd', maxZoom:18, noWrap:false}).addTo(map);
  }
  if(mapExpanded && _mapExpandedTileLayer){
    mapExpanded.removeLayer(_mapExpandedTileLayer);
    _mapExpandedTileLayer = L.tileLayer(url, {subdomains:'abcd', maxZoom:18, noWrap:false}).addTo(mapExpanded);
  }
}

// =============================== GEOGRAPHIC LINES (IDL + Equator) ===============================
// Natural Earth の geographic_lines.geojson から国際日付変更線（IDL）と赤道を取得し、
// 2D 地図に重ねて描画する。Globe.gl の _loadGlobePolygons() と同じく初回 fetch 後は
// データをキャッシュして再利用。
//
// 2 つの工夫：
//  1) 太平洋中心レイアウト（mapLng で経度を +360 シフト）に合わせるため、各 LineString に
//     mapLng を適用し、経度の不連続点（>180° ジャンプ）で LineString を分割。
//     ※ 赤道は -180→+180 の全周ラインなので、分割しないと「地図を横切る水平線」が描かれる。
//  2) Leaflet タイルが左右に繰り返し表示される領域にも線を出すため、-360 / 0 / +360 の
//     経度オフセットで複製描画する（Leaflet は polyline を自動 wrap しないため）。
let _geoLinesPromise = null;
let _geoLinesData = null; // { dateline: [[[lat,lng], ...], ...], equator: [...] }

function _loadGeoLines(){
  if(_geoLinesPromise) return _geoLinesPromise;
  _geoLinesPromise = fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_geographic_lines.geojson')
    .then(r => r.json())
    .then(geo => {
      if(!geo || !Array.isArray(geo.features)) return null;
      const pick = name => geo.features.find(f =>
        f && f.properties && f.properties.name === name);
      const idl = pick('International Date Line');
      const eq  = pick('Equator');
      _geoLinesData = {
        dateline: idl ? _geomToLatlngs(idl.geometry) : [],
        equator:  eq  ? _geomToLatlngs(eq.geometry)  : [],
      };
      return _geoLinesData;
    })
    .catch(e => {
      console.warn('Failed to load geographic lines:', e);
      _geoLinesPromise = null; // 再試行できるよう戻す
      return null;
    });
  return _geoLinesPromise;
}

// GeoJSON geometry → Leaflet 用 [[lat, lng], ...] の配列の配列。
// 太平洋中心レイアウト（mapLng）に合わせて経度シフト + 経度不連続点（>180° ジャンプ）で
// LineString を分割する。GeoJSON の座標順は [lng, lat] であることに注意。
function _geomToLatlngs(geom){
  if(!geom) return [];
  const lineStrings = [];
  if(geom.type === 'LineString'){
    lineStrings.push(geom.coordinates);
  } else if(geom.type === 'MultiLineString'){
    geom.coordinates.forEach(ls => lineStrings.push(ls));
  }
  const result = [];
  lineStrings.forEach(ls => {
    let cur = [];
    let prevLng = null;
    ls.forEach(coord => {
      const lng = coord[0], lat = coord[1];
      const m = mapLng(lng);
      if(prevLng !== null && Math.abs(m - prevLng) > 180){
        // 経度ジャンプ → ここで分割（2 点以上溜まっていれば確定）
        if(cur.length >= 2) result.push(cur);
        cur = [];
      }
      cur.push([lat, m]);
      prevLng = m;
    });
    if(cur.length >= 2) result.push(cur);
  });
  return result;
}

// 指定の Leaflet インスタンスに LineString 群を -360 / 0 / +360 オフセットで描画。
// タイルの繰り返し領域（左右の世界ループ）にも線が出る。
function _drawRepeatedPolylines(targetMap, latlngsArr, style){
  if(!targetMap || !latlngsArr) return;
  const offsets = [-360, 0, 360];
  latlngsArr.forEach(seg => {
    offsets.forEach(off => {
      const shifted = seg.map(p => [p[0], p[1] + off]);
      L.polyline(shifted, style).addTo(targetMap);
    });
  });
}

// 指定の Leaflet インスタンスに IDL + 赤道レイヤを追加。
// データ fetch 完了後にコールバックで描画（fetch を待つ間に initMap は完了して OK）。
function _addGeoLinesToMap(targetMap){
  if(!targetMap) return;
  _loadGeoLines().then(data => {
    if(!data || !targetMap) return;
    // IDL：amber 点線（dashArray:'4,4'）
    _drawRepeatedPolylines(targetMap, data.dateline, {
      color:cssVar('--map-idl'), weight:1.2, opacity:0.55, dashArray:'4,4', interactive:false
    });
    // 赤道：紫の点々ライン（dashArray:'2,5' で IDL と視覚的に区別）
    _drawRepeatedPolylines(targetMap, data.equator, {
      color:cssVar('--map-equator'), weight:1, opacity:0.45, dashArray:'2,5', interactive:false
    });
  });
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

  // Routes — Leaflet.Geodesic で大圏（球面上の最短経路）描画。
  // wrap:false → 太平洋中心レイアウトと相性を取るため、アンチメリディアン自動 wrap を抑止。
  //              （mapLng で既に手動シフト済みの座標が、内部で再度 wrap されるのを防ぐ）
  // steps     → 大圏曲線の分割数。8 で十分滑らか・計算量も軽い。
  const routeSet=new Set();
  data.forEach(f=>{
    const d=f.dep.trim(), a=f.arr.trim();
    const key=[d,a].sort().join('-');
    if(routeSet.has(key)) return;
    routeSet.add(key);
    const p1=AP[d], p2=AP[a];
    if(!p1||!p2) return;
    const line=L.geodesic(
      [[[p1.lat,mapLng(p1.lng)],[p2.lat,mapLng(p2.lng)]]],
      {color:cssVar('--map-route-line'),weight:1.5,opacity:0.35,dashArray:'6,4',wrap:false,steps:8}
    ).addTo(targetMap);
    routeLinesArr.push(line);
  });

  // Airport markers — 見た目を保ちつつタッチ用に大きな不可視ヒットエリアを重ねる
  Object.entries(apCount).forEach(([code,count])=>{
    const a=AP[code];
    if(!a) return;
    const isHub=count>=10;
    const size=isHub?14:Math.max(6,Math.min(12,count*1.5+4));
    const color=isHub?cssVar('--amber'):cssVar('--red');
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
  // テーマ追従：cssVar で都度読む。border / 背景 / 文字色をテーマ別に。
  const bg = cssVar('--bg-card'), border = cssVar('--border'), text = cssVar('--text');
  return `<div style="background:${bg};border:1px solid ${border};color:${text};`+
    `padding:6px 10px;border-radius:6px;font-family:Outfit,sans-serif;font-size:12px;`+
    `box-shadow:0 4px 16px rgba(0,0,0,0.25);">${html}</div>`;
}

function initGlobe(){
  if(_globe) return;
  const container = document.getElementById('globeContainer');
  _globe = Globe()(container)
    // NASA Blue Marble の高解像度テクスチャ（2048×1024）。earth-dark.jpg より遥かに精細。
    // bumpImageUrl と組み合わせて山岳の凹凸が出る → 平らな earth-dark より立体感が出る。
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundColor('rgba(0,0,0,0)')
    .atmosphereColor(cssVar('--globe-atmosphere'))
    .atmosphereAltitude(0.15)
    // 国境ポリゴン：ホバーで国名／地域名がツールチップ表示される。
    // 初期値は空、_loadGlobePolygons() が GeoJSON を非同期取得して差し込む。
    .polygonsData([])
    .polygonCapColor(() => cssVar('--globe-poly-cap'))
    .polygonSideColor(() => cssVar('--globe-poly-side'))
    // 国境線：従来は alpha 0.25 で薄すぎたため、Blue Marble の精細地表でも視認できる
    // 程度の白寄り（明るめ）+ alpha 0.7 に調整。altitude も 0.006 → 0.01 に上げて、
    // 線が地表からわずかに浮き上がる立体感を付与（ズーム時の埋もれ防止）。
    .polygonStrokeColor(() => cssVar('--globe-poly-stroke'))
    .polygonAltitude(0.01)
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
      _globeLabelHTML(`<b style="color:${cssVar('--accent')}">${d.code}</b> — ${d.city}<br>${d.count} flights`))
    // ルート：大圏アーク（球面上の最短経路）
    .arcsData([])
    .arcStartLat('startLat').arcStartLng('startLng')
    .arcEndLat('endLat').arcEndLng('endLng')
    .arcColor(() => cssVar('--globe-arc'))
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

// テーマ切替時に Globe の色（大気・国境ポリゴン・アーク）を最新の CSS 変数から再適用。
// polygonCapColor などのコールバックは描画時に呼ばれるが、Globe.gl は色設定単独では
// 再レンダリングを起こさないため、データ参照を再設定して強制 redraw する。
function applyGlobeTheme(){
  if(!_globe) return;
  _globe
    .atmosphereColor(cssVar('--globe-atmosphere'))
    .polygonCapColor(() => cssVar('--globe-poly-cap'))
    .polygonSideColor(() => cssVar('--globe-poly-side'))
    .polygonStrokeColor(() => cssVar('--globe-poly-stroke'))
    .arcColor(() => cssVar('--globe-arc'));
  // 強制 redraw：データを「同じ参照で再代入」して Globe.gl のレンダリングをトリガー
  _globe.polygonsData(_globe.polygonsData());
  _globe.pointsData(_globe.pointsData());
  _globe.arcsData(_globe.arcsData());
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
      color: isHub ? cssVar('--amber') : cssVar('--red'),
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
