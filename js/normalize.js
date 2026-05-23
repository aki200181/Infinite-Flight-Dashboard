// =============================== NORMALIZE ===============================
// 入力の揺れ補正。日付・時間・空港・機材の表記ゆれを内部標準形に揃える。
// CSV 取り込みや手動入力など「データが入る境界」で必ず通すこと。
// 正準形は NORMALIZATION.md を参照。
//
// 依存: IATA_TO_ICAO (airports.js)

// =============================== DATE ===============================
function normalizeDate(raw){
  let s=raw.trim();
  // Already correct: 2025-06-01
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY/MM/DD or YYYY.MM.DD
  if(/^\d{4}[\/\.]\d{1,2}[\/\.]\d{1,2}$/.test(s)){
    const p=s.split(/[\/\.]/); return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
  }
  // YY-MM-DD or YY/MM/DD
  if(/^\d{2}[-\/\.]\d{1,2}[-\/\.]\d{1,2}$/.test(s)){
    const p=s.split(/[-\/\.]/);
    const yr=parseInt(p[0]); const full=yr>=50?'19'+p[0]:'20'+p[0];
    return `${full}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
  }
  // YYYYMMDD (no separators)
  if(/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  // DD/MM/YYYY or DD-MM-YYYY (if day > 12 we know it's DD/MM)
  if(/^\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4}$/.test(s)){
    const p=s.split(/[-\/\.]/);
    if(parseInt(p[0])>12) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    // Ambiguous — assume MM/DD/YYYY (US-style) if first<=12
    return `${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}`;
  }
  // YYYY-M-D (missing leading zeros)
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){
    const p=s.split('-'); return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
  }
  return null; // Can't parse
}

// =============================== TIME ===============================
function normalizeTime(raw){
  let s=raw.trim().toLowerCase().replace(/\s+/g,'');
  // Already correct: 1h30m
  if(/^\d+h\d+m$/.test(s)) return s;
  // 1h30 (missing m)
  if(/^\d+h\d+$/.test(s)) return s+'m';
  // 1:30 or 01:30
  if(/^\d{1,2}:\d{2}$/.test(s)){
    const [h,m]=s.split(':'); return `${parseInt(h)}h${m}m`;
  }
  // 90m (minutes only)
  if(/^\d+m$/.test(s)){
    const mins=parseInt(s); return `${Math.floor(mins/60)}h${(mins%60).toString().padStart(2,'0')}m`;
  }
  // 1H30M (uppercase)
  if(/^\d+[hH]\d+[mM]$/.test(s)) return s.replace(/[HM]/g,c=>c.toLowerCase());
  // 1h (hours only, no minutes)
  if(/^\d+h$/.test(s)) return s+'00m';
  // 1.5h (decimal hours)
  if(/^[\d.]+h$/.test(s)){
    const hrs=parseFloat(s); const h=Math.floor(hrs); const m=Math.round((hrs-h)*60);
    return `${h}h${m.toString().padStart(2,'0')}m`;
  }
  return null; // Can't parse
}

// =============================== AIRPORT ===============================
// 旧コード／タイポを正準 ICAO に揃える救済テーブル。
// （IATA→ICAO は airports.js の IATA_TO_ICAO を使用）
const ICAO_ALIASES = {
  NZQH: 'NZQN', // Queenstown：誤った旧コード。正しくは NZQN
};

// 入力を compact 化（大文字英数のみ）したうえで段階的に照合する。
//   1. 旧 ICAO のタイポ救済（ICAO_ALIASES, 例: NZQH→NZQN）
//   2. 既知の 4 文字 ICAO はそのまま
//   3. 3 文字 IATA → ICAO 変換
//   4. 都市+空港識別子（例: "Tokyo HND" → TOKYOHND → RJTT）
//   5. 都市名のみ（単一空港の都市のみ、例: "Zurich" → LSZH）
//   6. どれにも一致しない場合は compact 形をそのまま返す（後段で validation エラー）
function normalizeAirport(raw){
  if(raw == null) return null;
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(!s) return null;
  if(ICAO_ALIASES[s]) return ICAO_ALIASES[s];
  if(s.length === 4 && typeof AP !== 'undefined' && AP[s]) return s;
  if(s.length === 3 && typeof IATA_TO_ICAO !== 'undefined' && IATA_TO_ICAO[s]){
    return IATA_TO_ICAO[s];
  }
  if(typeof CITY_AIRPORT_TO_ICAO !== 'undefined' && CITY_AIRPORT_TO_ICAO[s]){
    return CITY_AIRPORT_TO_ICAO[s];
  }
  if(typeof CITY_TO_ICAO !== 'undefined' && CITY_TO_ICAO[s]){
    return CITY_TO_ICAO[s];
  }
  return s;
}

// =============================== AIRCRAFT ===============================
// 正準コード → 別名リスト。
// 別名は「大文字化＋英数以外を除去（compact 化）」した形で書く。
// 例：「Boeing 777-300ER」「777-300ER」「77W」はすべて B77W に揃う。
// 規約は NORMALIZATION.md を参照。IF（Infinite Flight）の実機材に絞る。
const AIRCRAFT_CANONICAL_TABLE = {
  // ===== Cessna =====
  C172: ['172', '172SP', 'CESSNA172'],
  C208: ['208', 'CESSNA208', 'CARAVAN', 'CESSNACARAVAN'],
  // ===== Cirrus =====
  SR22: ['CIRRUSSR22'],
  // ===== TBM =====
  TBM9: ['TBM900', 'TBM930', 'TBM9X'],
  // ===== Pilatus =====
  PC12: ['PILATUSPC12', 'PC12NG'],
  // ===== Gulfstream =====
  GLF6: ['G650', 'G650ER', 'GULFSTREAMG650', 'GULFSTREAM650'],
  // ===== Bombardier ビジネス =====
  CL35: ['CL350', 'CHALLENGER350'],
  // ===== Airbus A220（旧CSeries） =====
  BCS1: ['CS100', 'A220100'],
  BCS3: ['CS300', 'A220300'],
  // ===== Airbus 単通路 =====
  A318: ['318'],
  A319: ['319'],
  A320: ['320', 'A320CEO', 'A320NEO', 'A20N'],
  A321: ['321', 'A321CEO', 'A321NEO', 'A21N'],
  // ===== Airbus A310 =====
  A310: ['310', 'A310300'],
  // ===== Airbus A330 =====
  A332: ['332', 'A330200'],
  A333: ['333', 'A330300'],
  A338: ['338', 'A330800', 'A330NEO800'],
  A339: ['339', 'A330900', 'A330NEO', 'A330NEO900'],
  // ===== Airbus A340 =====
  A342: ['342', 'A340200'],
  A343: ['343', 'A340300'],
  A345: ['345', 'A340500'],
  A346: ['346', 'A340600'],
  // ===== Airbus A350 =====
  A359: ['359', 'A350', 'A350900'],
  A35K: ['35K', 'A3501000', 'A350K'],
  // ===== Airbus A380 =====
  A388: ['388', 'A380', 'A380800'],
  // ===== Boeing 737 NG =====
  B737: ['7377', '737700', '737700ER'],
  B738: ['738', '737800', '737800ER'],
  B739: ['739', '737900', '737900ER'],
  // ===== Boeing 737 MAX =====（generic "737MAX" は最も普及している MAX 8 にデフォルト）
  // ※ "737-7" 等の表記は compact 化で "7377" になり 737-700(NG) と衝突するため、
  //    MAX は必ず "MAX" 文字列を含む別名のみで認識する。
  B37M: ['7377MAX', '737MAX7', '737M7', 'MAX7'],
  B38M: ['7378MAX', '737MAX8', '737M8', '737MAX', 'MAX8'],
  B39M: ['7379MAX', '737MAX9', '737M9', 'MAX9'],
  B3XM: ['73710MAX', '737MAX10', '737M10', 'MAX10'],
  // ===== Boeing 747 =====
  B742: ['742', '747200'],
  B744: ['744', '747400'],
  B748: ['748', '7478', '7478I', '7478F', '747800', '747800I', '7478INTERCONTINENTAL'],
  // ===== Boeing 757 =====
  B752: ['752', '757200'],
  B753: ['753', '757300'],
  // ===== Boeing 767 =====
  B763: ['763', '767300'],
  B764: ['764', '767400'],
  // ===== Boeing 777 =====
  B772: ['772', '777200','777200ER'],
  B77L: ['77L', '777200LR'],
  B773: ['773', '777300'],
  B77W: ['77W', '777300ER'],
  B77F: ['77F', '777F', '777200F', '777FREIGHTER'],
  // ===== Boeing 787 =====
  B788: ['788', '7878', '787800'],
  B789: ['789', '7879', '787900'],
  B78X: ['78X', '78710', '78X10', '787100'],
  // ===== McDonnell Douglas =====
  MD11: ['MD11F'],
  DC10: ['DC1030', 'DC1040'],
  // ===== Embraer E-Jets =====
  E170: ['170', 'EMB170', 'ERJ170'],
  E175: ['175', 'EMB175', 'ERJ175'],
  E190: ['190', 'EMB190', 'ERJ190'],
  E195: ['195', 'EMB195', 'ERJ195'],
  // ===== Bombardier CRJ =====
  CRJ7: ['CRJ700'],
  CRJ9: ['CRJ900'],
  // ===== COMAC =====
  C919: ['COMAC919', 'COMACC919'],
  // ===== 軍用・政府専用 =====
  F22:  ['F22A', 'FA22', 'RAPTOR'],
  C17:  ['C17A', 'GLOBEMASTER', 'GLOBEMASTERIII'],
  VC25A:['VC25', 'AIRFORCEONE', 'AF1', '747200B'],
  C40B: ['C40', 'C40C', 'C40BC'],
};

// canonical→canonical, alias→canonical の両方を1辞書に集約（起動時に構築）
const AIRCRAFT_ALIASES = {};
Object.entries(AIRCRAFT_CANONICAL_TABLE).forEach(([canonical, aliases]) => {
  AIRCRAFT_ALIASES[canonical] = canonical;
  aliases.forEach(a => { AIRCRAFT_ALIASES[a] = canonical; });
});

// メーカー名のプレフィックスを除去（剥がして機種コード単独にする）。
// "MD"/"ERJ"/"ATR" は機種名の一部（MD11, ERJ190, ATR72）なので含めない。
// "McDonnell Douglas" の "MD" は MCDONNELL の方で剥がれるので個別不要。
const AIRCRAFT_PREFIX_RE = /^(BOEING|AIRBUS|EMBRAER|BOMBARDIER|MCDONNELL\s*DOUGLAS|CESSNA|CIRRUS|GULFSTREAM|PILATUS|COMAC)\s*/i;

// =============================== AIRLINE ===============================
// 正式名称（canonical）→ エイリアス（IATA 2 文字 / ICAO 3 文字 / 別表記）。
// エイリアスは大文字英数のみの compact 形で書く。
// 不明な入力は元の文字列をそのまま返す（ユーザー入力を壊さない）。
const AIRLINE_TABLE = {
  // ===== 日本 =====
  "All Nippon Airways":     ["NH", "ANA", "ALLNIPPON", "ALLNIPPONAIRWAYSCO"],
  "Japan Airlines":         ["JL", "JAL", "JAPANAIRLINESCO", "JAPANAIRLINESCOLTD"],
  "Skymark Airlines":       ["BC", "SKY", "SKYMARK"],
  "Star Flyer":             ["7G", "SFJ", "STARFLYER"],
  "AirDo":                  ["HD", "ADO", "AIRDO"],
  "Solaseed Air":           ["6J", "SNJ", "SOLASEED", "SOLASEEDAIR"],
  "IBEX Airlines":          ["FW", "IBX", "IBEX"],
  "Peach Aviation":         ["MM", "APJ", "PEACH", "PEACHAVIATION"],
  "Jetstar Japan":          ["GK", "JJP", "JETSTARJAPAN"],
  "Zipair Tokyo":           ["ZG", "TZP", "ZIPAIR", "ZIPAIRTOKYO"],
  "Fuji Dream Airlines":    ["JH", "FDA", "FUJIDREAM", "FUJIDREAMAIRLINES"],
  // ===== 韓国 =====
  "Korean Air":             ["KE", "KAL", "KOREANAIR"],
  "Asiana Airlines":        ["OZ", "AAR", "ASIANA"],
  "Jeju Air":               ["7C", "JJA", "JEJUAIR"],
  // ===== 中華圏 =====
  "Air China":              ["CA", "CCA", "AIRCHINA"],
  "China Eastern Airlines": ["MU", "CES", "CHINAEASTERN"],
  "China Southern Airlines":["CZ", "CSN", "CHINASOUTHERN"],
  "Hainan Airlines":        ["HU", "CHH", "HAINAN"],
  "Shenzhen Airlines":      ["ZH", "CSZ", "SHENZHEN"],
  "Spring Airlines":        ["9C", "CQH", "SPRING"],
  "Xiamen Airlines":        ["MF", "CXA", "XIAMENAIR", "XIAMEN"],
  "Sichuan Airlines":       ["3U", "CSC", "SICHUAN"],
  "Cathay Pacific":         ["CX", "CPA", "CATHAY"],
  "Hong Kong Airlines":     ["HX", "CRK", "HONGKONGAIRLINES"],
  "China Airlines":         ["CI", "CAL", "CHINAAIRLINES"],
  "EVA Air":                ["BR", "EVA", "EVAAIR", "EVAAIRWAYS"],
  // ===== 東南アジア =====
  "Singapore Airlines":     ["SQ", "SIA"],
  "Scoot":                  ["TR", "TGW", "SCOOT"],
  "Malaysia Airlines":      ["MH", "MAS"],
  "AirAsia":                ["AK", "AXM", "AIRASIA"],
  "Thai Airways":           ["TG", "THA", "THAIAIRWAYS"],
  "Vietnam Airlines":       ["VN", "HVN"],
  "Garuda Indonesia":       ["GA", "GIA", "GARUDA"],
  "Lion Air":               ["JT", "LNI", "LIONAIR"],
  "Philippine Airlines":    ["PR", "PAL"],
  "Cebu Pacific":           ["5J", "CEB", "CEBUPACIFIC"],
  // ===== 中東 =====
  "Emirates":               ["EK", "UAE"],
  "Etihad Airways":         ["EY", "ETD", "ETIHAD"],
  "Qatar Airways":          ["QR", "QTR", "QATAR"],
  "Saudia":                 ["SV", "SVA", "SAUDI", "SAUDIA"],
  "Gulf Air":               ["GF", "GFA", "GULFAIR"],
  "Royal Jordanian":        ["RJ", "RJA", "ROYALJORDANIAN"],
  "El Al":                  ["LY", "ELY", "ELAL"],
  // ===== インド =====
  "Air India":              ["AI", "AIC", "AIRINDIA"],
  "IndiGo":                 ["6E", "IGO", "INDIGO"],
  // ===== ヨーロッパ =====
  "Air France":             ["AF", "AFR", "AIRFRANCE"],
  "KLM Royal Dutch Airlines":["KL", "KLM", "KLMROYAL", "KLMROYALDUTCHAIRLINES"],
  "Lufthansa":              ["LH", "DLH"],
  "British Airways":        ["BA", "BAW"],
  "Iberia":                 ["IB", "IBE"],
  "Swiss International Air Lines":["LX", "SWR", "SWISS", "SWISSINTERNATIONAL"],
  "Austrian Airlines":      ["OS", "AUA", "AUSTRIAN"],
  "SAS Scandinavian Airlines":["SK", "SAS", "SCANDINAVIAN"],
  "Finnair":                ["AY", "FIN"],
  "ITA Airways":            ["AZ", "ITY"],
  "Alitalia":               ["AZA", "ALITALIA"],
  "TAP Air Portugal":       ["TP", "TAP", "TAPPORTUGAL"],
  "Aer Lingus":             ["EI", "EIN", "AERLINGUS"],
  "Ryanair":                ["FR", "RYR"],
  "easyJet":                ["U2", "EZY", "EASYJET"],
  "Virgin Atlantic":        ["VS", "VIR", "VIRGINATLANTIC"],
  "TUI fly":                ["X3", "TUI", "TUIFLY"],
  "Norwegian":              ["DY", "NAX", "NOR", "NORWEGIAN"],
  "Wizz Air":               ["W6", "WZZ", "WIZZ"],
  "LOT Polish Airlines":    ["LO", "LOT", "LOTPOLISH"],
  "Turkish Airlines":       ["TK", "THY", "TURKISHAIRLINES"],
  "Aeroflot":               ["SU", "AFL", "AEROFLOT"],
  "Aegean Airlines":        ["A3", "AEE", "AEGEAN"],
  "Air Serbia":             ["JU", "ASL", "AIRSERBIA"],
  // ===== 北米 =====
  "American Airlines":      ["AA", "AAL", "AMERICAN"],
  "Delta Air Lines":        ["DL", "DAL", "DELTA"],
  "United Airlines":        ["UA", "UAL", "UNITED"],
  "Southwest Airlines":     ["WN", "SWA", "SOUTHWEST"],
  "JetBlue Airways":        ["B6", "JBU", "JETBLUE"],
  "Alaska Airlines":        ["AS", "ASA", "ALASKA"],
  "Spirit Airlines":        ["NK", "NKS", "SPIRIT"],
  "Frontier Airlines":      ["F9", "FFT", "FRONTIER"],
  "Hawaiian Airlines":      ["HA", "HAL", "HAWAIIAN"],
  "Air Canada":             ["AC", "ACA", "AIRCANADA"],
  "WestJet":                ["WS", "WJA", "WESTJET"],
  "Aeromexico":             ["AM", "AMX", "AEROMEXICO"],
  // ===== オセアニア =====
  "Qantas":                 ["QF", "QFA"],
  "Jetstar":                ["JQ", "JST", "JETSTAR"],
  "Virgin Australia":       ["VA", "VOZ", "VIRGINAUSTRALIA"],
  "Air New Zealand":        ["NZ", "ANZ"],
  // ===== 南米 =====
  "LATAM Airlines":         ["LA", "LAN", "LTM", "LATAM"],
  "Avianca":                ["AV", "AVA"],
  "Aerolineas Argentinas":  ["AR", "ARG"],
  "GOL":                    ["G3", "GLO", "GOL"],
  "Azul":                   ["AD", "AZU", "AZUL"],
  // ===== アフリカ =====
  "Ethiopian Airlines":     ["ET", "ETH", "ETHIOPIAN"],
  "South African Airways":  ["SA", "SAA"],
  "Kenya Airways":          ["KQ", "KQA", "KENYAAIRWAYS"],
  "EgyptAir":               ["MS", "MSR", "EGYPTAIR"],
};

// canonical の compact 形と alias を 1 つの辞書に集約（起動時に構築）
const AIRLINE_ALIASES = {};
Object.entries(AIRLINE_TABLE).forEach(([canonical, aliases]) => {
  const compactCanon = canonical.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(compactCanon) AIRLINE_ALIASES[compactCanon] = canonical;
  aliases.forEach(a => {
    const c = String(a).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if(c && !AIRLINE_ALIASES[c]) AIRLINE_ALIASES[c] = canonical;
  });
});

// 入力されたエアライン名／コードを正式名称に揃える。
// AIRLINE_TABLE に該当が無ければ元の文字列を trim して返す（formatting 維持）。
function normalizeAirline(raw){
  if(raw == null) return null;
  const original = String(raw).trim();
  if(!original) return null;
  const compact = original.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(compact && AIRLINE_ALIASES[compact]) return AIRLINE_ALIASES[compact];
  return original;
}

// =============================== AIRCRAFT ===============================
// 機材入力を正準 ICAO に揃える。
// 不明なものは compact 化した値（大文字英数のみ）を返す — 後段は弾かない。
function normalizeAircraft(raw){
  if(raw == null) return null;
  let s = String(raw).toUpperCase().trim();
  s = s.replace(AIRCRAFT_PREFIX_RE, '');
  const compact = s.replace(/[^A-Z0-9]/g, '');
  if(!compact) return null;
  // 直接ヒット（canonical または alias）
  if(AIRCRAFT_ALIASES[compact]) return AIRCRAFT_ALIASES[compact];
  // 救済：先頭が「英字1 + 数字3桁以上」のとき、頭の英字を剥がしてもう一度試す。
  // 例：「B777300ER」→「777300ER」→ B77W、「B737800」→「737800」→ B738。
  // これで「B777-300ER」「B737-800」のような表記もメーカー記号 B/A 付きで認識できる。
  if(/^[A-Z]\d{3}/.test(compact)){
    const stripped = compact.substring(1);
    if(AIRCRAFT_ALIASES[stripped]) return AIRCRAFT_ALIASES[stripped];
  }
  return compact;
}
