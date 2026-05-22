// =============================== DATA SOURCE ===============================
// Flight history and custom airports are loaded from CSV at runtime.
// Nothing is baked into this HTML — open the file fresh and it starts empty.
//
// The DataSource module is the single boundary between UI and data.
// Swapping CSV for a server fetch later means replacing only DataSource.load().

const DataSource = (function(){
  let _flights = [];       // [{no, date, dep, arr, ac, al, t}, ...]
  let _customAirports = {};// {ICAO:{lat,lng,city,co,ct}, ...}
  let _dirty = false;      // true when in-memory state diverges from last imported/exported CSV

  function _renumber(){
    _flights.sort((a,b) => a.date.localeCompare(b.date));
    _flights.forEach((f,i) => f.no = i + 1);
  }
  function _key(f){
    // Duplicate-detection key — same flight = same date/dep/arr/aircraft/airline/duration
    return [f.date, f.dep, f.arr, f.ac, (f.al||'').trim().toLowerCase(), f.t].join('|');
  }

  return {
    get flights(){ return _flights; },
    get customAirports(){ return _customAirports; },
    get dirty(){ return _dirty; },
    get count(){ return _flights.length; },

    markClean(){ _dirty = false; if(typeof onDirtyChange==='function') onDirtyChange(); },
    markDirty(){ _dirty = true;  if(typeof onDirtyChange==='function') onDirtyChange(); },

    // Replace entire flight list (used by full CSV reload)
    replaceAll(newFlights){
      _flights = newFlights.map(f => ({...f}));
      _renumber();
      this.markClean();
    },

    // Append flights; returns {added, duplicates}
    addFlights(newFlights, {skipDuplicates=true} = {}){
      const existing = new Set(_flights.map(_key));
      const added = [], duplicates = [];
      newFlights.forEach(f => {
        if(skipDuplicates && existing.has(_key(f))){
          duplicates.push(f);
        } else {
          _flights.push({...f, no:0});
          existing.add(_key(f));
          added.push(f);
        }
      });
      _renumber();
      if(added.length) this.markDirty();
      return {added, duplicates};
    },

    addOne(f){
      _flights.push({...f, no:0});
      _renumber();
      this.markDirty();
    },

    removeByIds(ids){
      const set = new Set(ids);
      const before = _flights.length;
      _flights = _flights.filter(f => !set.has(f.no));
      _renumber();
      const removed = before - _flights.length;
      if(removed) this.markDirty();
      return removed;
    },

    clearAll(){
      const n = _flights.length;
      _flights = [];
      if(n) this.markDirty();
      return n;
    },

    // Custom airports (not in the built-in 172-airport DB)
    addAirports(newAPs){
      let added = 0;
      Object.entries(newAPs).forEach(([icao, data]) => {
        if(!_customAirports[icao]){ _customAirports[icao] = data; added++; }
      });
      if(added) this.markDirty();
      return added;
    },
  };
})();

// `flights` is kept as a backward-compatible reference into DataSource.
// All mutations should go through DataSource; reads via `flights` are fine.
let flights = DataSource.flights;

// Hook for UI to react to dirty-state changes
let onDirtyChange = null;

