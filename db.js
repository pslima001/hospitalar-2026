// IndexedDB wrapper minimalista
const DB_NAME = 'hospitalar';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('empresas')) {
        db.createObjectStore('empresas', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('visitas')) {
        // 1 visita por empresa (id=empresa_id)
        db.createObjectStore('visitas', { keyPath: 'empresa_id' });
      }
      if (!db.objectStoreNames.contains('extras')) {
        // scans camiseta (id auto)
        db.createObjectStore('extras', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('fotos')) {
        // fotos prospect (key = prospect_key)
        db.createObjectStore('fotos');
      }
    };
  });
  return dbPromise;
}

async function tx(store, mode='readonly') {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

const db = {
  async getEmpresas() {
    const store = await tx('empresas');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async getEmpresa(id) {
    const store = await tx('empresas');
    return new Promise((res, rej) => {
      const req = store.get(id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async putEmpresa(emp) {
    const store = await tx('empresas', 'readwrite');
    return new Promise((res, rej) => {
      const req = store.put(emp);
      req.onsuccess = () => res(); req.onerror = () => rej(req.error);
    });
  },
  async bulkEmpresas(list) {
    const db_ = await openDB();
    const t = db_.transaction('empresas', 'readwrite');
    const s = t.objectStore('empresas');
    list.forEach(e => s.put(e));
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },
  async getEmpresasCount() {
    const store = await tx('empresas');
    return new Promise((res) => {
      const req = store.count();
      req.onsuccess = () => res(req.result);
    });
  },

  async getVisita(empresa_id) {
    const store = await tx('visitas');
    return new Promise((res, rej) => {
      const req = store.get(empresa_id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  },
  async putVisita(v) {
    const store = await tx('visitas', 'readwrite');
    return new Promise((res, rej) => {
      v.updated_at = new Date().toISOString();
      const req = store.put(v);
      req.onsuccess = () => res(); req.onerror = () => rej(req.error);
    });
  },
  async getAllVisitas() {
    const store = await tx('visitas');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
  },

  async getAllExtras() {
    const store = await tx('extras');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
  },
  async addExtra(e) {
    const store = await tx('extras', 'readwrite');
    return new Promise((res, rej) => {
      e.created_at = new Date().toISOString();
      const req = store.add(e);
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
  },
  async putExtra(e) {
    const store = await tx('extras', 'readwrite');
    return new Promise((res, rej) => {
      const req = store.put(e);
      req.onsuccess = () => res(); req.onerror = () => rej(req.error);
    });
  },
  async deleteExtra(id) {
    const store = await tx('extras', 'readwrite');
    return new Promise((res, rej) => {
      const req = store.delete(id);
      req.onsuccess = () => res(); req.onerror = () => rej(req.error);
    });
  },

  async getFoto(key) {
    const store = await tx('fotos');
    return new Promise((res, rej) => {
      const req = store.get(key);
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
  },
  async putFoto(key, blob) {
    const store = await tx('fotos', 'readwrite');
    return new Promise((res, rej) => {
      const req = store.put(blob, key);
      req.onsuccess = () => res(); req.onerror = () => rej(req.error);
    });
  },

  async clearAll() {
    const db_ = await openDB();
    const t = db_.transaction(['empresas','visitas','extras','fotos'], 'readwrite');
    t.objectStore('empresas').clear();
    t.objectStore('visitas').clear();
    t.objectStore('extras').clear();
    t.objectStore('fotos').clear();
    return new Promise((res, rej) => {
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  }
};
