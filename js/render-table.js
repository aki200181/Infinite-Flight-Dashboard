// =============================== RENDER · FLIGHT LOG TABLE ===============================
// フライトログテーブル本体（描画・ソート・選択・検索）と、
// Flight Log カードの拡大ウィンドウ（card-fullscreen トグル + フッター）。
// 依存: getFiltered / parseMin (compute.js), _fmtHM (render.js)

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

// =============================== FLIGHT LOG EXPANDED (拡大ウィンドウ) ===============================
// Flight Log フッターの内容を現在のフィルタ済みデータで更新。
// CSS で通常時は display:none、拡大ウィンドウ時のみ表示されるが、内容は常に最新に保つ。
function _updateFlightLogFooter(){
  const data=getFiltered();
  const totalMin=data.reduce((s,f)=>s+parseMin(f.t),0);
  const c=document.getElementById('flightLogFooterCount');
  const t=document.getElementById('flightLogFooterTime');
  if(c) c.textContent=`${data.length} flight${data.length===1?'':'s'}`;
  if(t) t.textContent=`${_fmtHM(totalMin)} total`;
}

// カード自体に .card-fullscreen を付けて画面中央に modal 風表示。
// 他オーバーレイ（flights / continents / map / globe）と同じ中央配置・固定サイズ。
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
