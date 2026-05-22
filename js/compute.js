// =============================== COMPUTE ===============================
// 集計とフィルタの純粋ロジック層。DOM には触らない。
// 依存: AP (airports.js), flights (datasource.js)

// =============================== HELPERS ===============================
function sorted(map){return Object.entries(map).sort((a,b)=>b[1]-a[1]);}
function parseMin(t){const m=t.match(/(\d+)h(\d+)m/);return m?parseInt(m[1])*60+parseInt(m[2]):0;}

// =============================== FILTER STATE ===============================
// 各項目は配列。空配列なら「絞り込みなし」を意味する。
// 将来の複数選択 UI / 国内線フィルタ等の拡張に備えた述語エンジン方式。
// URL パラメータは互換維持のため単数名（year, airline, ...）、値は カンマ区切り。
const FilterState = {
  years: [],
  airlines: [],
  aircraft: [],
  countries: [],
  domesticOnly: false,      // 国内線のみ（出発・到着が同じ国）
  internationalOnly: false, // 国際線のみ（domesticOnly と互他的）
};

function _flightCountry(f){
  const dep=AP[f.dep], arr=AP[f.arr];
  return [dep?dep.co:null, arr?arr.co:null].filter(Boolean);
}

// 国内線かどうか：両端の空港の所属国コードが一致するなら true。
// 片方が AP 未登録なら判定不能 → 国内線扱いはしない（false）。
function _flightIsDomestic(f){
  const dep=AP[f.dep.trim()], arr=AP[f.arr.trim()];
  return !!(dep && arr && dep.co === arr.co);
}

// 現在の FilterState から「有効な述語」だけを集めた配列を返す。
// 各述語は flight → bool。getFiltered は全述語を every() で通す。
function _buildPredicates(){
  const preds=[];
  if(FilterState.years.length){
    preds.push(f => FilterState.years.includes(f.date.slice(0,4)));
  }
  if(FilterState.airlines.length){
    preds.push(f => FilterState.airlines.includes(f.al));
  }
  if(FilterState.aircraft.length){
    preds.push(f => FilterState.aircraft.includes(f.ac));
  }
  if(FilterState.countries.length){
    // dep / arr どちらかの所属国が選択集合に入っていれば一致
    preds.push(f => _flightCountry(f).some(c => FilterState.countries.includes(c)));
  }
  if(FilterState.domesticOnly){
    preds.push(_flightIsDomestic);
  }
  if(FilterState.internationalOnly){
    preds.push(f => !_flightIsDomestic(f));
  }
  return preds;
}

function getFiltered(){
  const preds=_buildPredicates();
  if(preds.length===0) return flights.slice();
  return flights.filter(f => preds.every(p => p(f)));
}

// 何らかの絞り込みが効いているか
function isAnyFilterActive(){
  return FilterState.years.length>0
      || FilterState.airlines.length>0
      || FilterState.aircraft.length>0
      || FilterState.countries.length>0
      || FilterState.domesticOnly
      || FilterState.internationalOnly;
}

// =============================== COMPARE STATE ===============================
// 任意の2集合（典型例：2年）を比較するための選択状態。
// year* は UI 上のドロップダウンと連動。最初の初期化は main.js 側で行う。
const CompareState = { yearA:'', yearB:'' };

// 1 つのフライト集合から要約統計を返す（compareStats のためのヘルパ）。
// 純粋関数：DOM に触らない、グローバル状態を読まない。
function computeSetStats(arr){
  const airports=new Set(), countries=new Set();
  let count=0, mins=0;
  arr.forEach(f=>{
    count++;
    mins+=parseMin(f.t);
    [f.dep,f.arr].forEach(c=>{
      airports.add(c);
      const m=AP[c]; if(m) countries.add(m.co);
    });
  });
  return { count, mins, airports, countries };
}

// 2 集合（集合A、集合B）を比較。差分の計算は呼び出し側で。
// 戻り値: { a:{count,mins,airports,countries}, b:同 }
function compareStats(setA, setB){
  return { a: computeSetStats(setA), b: computeSetStats(setB) };
}

function computeAll(data){
  const ac={},al={},rt={},ap={},yr={},mo={};
  // 機材／航空会社ごとの「総飛行時間（分）」も並行集計。
  // バー表示で「回数 · 総時間」を併記するため。
  const acMin={}, alMin={};
  // 曜日別カウント。インデックスは Mon=0, Tue=1, ..., Sun=6（ISO-8601 風）。
  // Date#getDay() は Sun=0..Sat=6 を返すので (d+6) % 7 で Mon 起点へ。
  const wd={0:0,1:0,2:0,3:0,4:0,5:0,6:0};
  data.forEach(f=>{
    ac[f.ac]=(ac[f.ac]||0)+1;
    al[f.al]=(al[f.al]||0)+1;
    rt[f.dep+' → '+f.arr]=(rt[f.dep+' → '+f.arr]||0)+1;
    ap[f.dep]=(ap[f.dep]||0)+1; ap[f.arr]=(ap[f.arr]||0)+1;
    yr[f.date.slice(0,4)]=(yr[f.date.slice(0,4)]||0)+1;
    mo[+f.date.slice(5,7)]=(mo[+f.date.slice(5,7)]||0)+1;
    const mins=parseMin(f.t);
    acMin[f.ac]=(acMin[f.ac]||0)+mins;
    alMin[f.al]=(alMin[f.al]||0)+mins;
    // 曜日：YYYY-MM-DD を Date に渡すと UTC 解釈になり日付ズレの可能性があるため、
    // 明示的に Year/Month/Day で構築してローカル曜日を取る。
    const [yy,mm,dd]=f.date.split('-').map(Number);
    const wIdx=(new Date(yy, mm-1, dd).getDay()+6)%7;
    wd[wIdx]=(wd[wIdx]||0)+1;
  });
  const co={},ci={},ct={};
  data.forEach(f=>{
    [f.dep,f.arr].forEach(c=>{
      const m=AP[c.trim()];
      if(m){co[m.co]=(co[m.co]||0)+1;ci[m.city]=(ci[m.city]||0)+1;ct[m.ct]=(ct[m.ct]||0)+1;}
    });
  });
  return {
    ac:sorted(ac), al:sorted(al), rt:sorted(rt), ap:sorted(ap), yr, mo, wd,
    co:sorted(co), ci:sorted(ci), ct:sorted(ct),
    acMin, alMin,
  };
}
