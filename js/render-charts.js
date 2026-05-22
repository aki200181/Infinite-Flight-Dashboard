// =============================== RENDER · CHARTS ===============================
// Chart.js による描画一式：Continent doughnut / Year bar / Month line / Weekday line。
// Continents カードの拡大表示（大ドーナツ）もここに含む（地図・地球儀と同じく
// 専用オーバーレイ ＋ 別 Chart.js インスタンス）。
// 依存: Chart (Chart.js CDN), computeAll / getFiltered (compute.js),
//       showToast (render.js)

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

// =============================== CONTINENTS EXPANDED (大ドーナツ) ===============================
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
