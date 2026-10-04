import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Check if the active logged-in user has the specific corporate PAN to skip SQLite storage/seeding
 */
export async function shouldSkipSQLite(): Promise<boolean> {
  try {
    const sessionStr = await AsyncStorage.getItem('userSession');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      return session?.corporatePAN === 'AADCT8072F';
    }
  } catch (e) {
    // Default to false
  }
  return false;
}

/**
 * Open and initialize the diagnostic database
 */
export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    try {
      dbInstance = await SQLite.openDatabaseAsync('app_diagnostic.db');

      // Initialize the schema inside a transaction block
      await dbInstance.execAsync(`
        PRAGMA journal_mode = WAL;
        
        CREATE TABLE IF NOT EXISTS call_logs_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mobile TEXT NOT NULL,
          name TEXT,
          status TEXT,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS geo_ticks_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          accuracy REAL,
          site_name TEXT,
          timestamp TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS app_diagnostics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          description TEXT,
          timestamp TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS attendance_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payload TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `);

      // Dynamic check for special corporate PAN AADCT8072F
      const skipData = await shouldSkipSQLite();
      if (skipData) {
        // Enforce empty tables for this corporate context
        await dbInstance.execAsync(`
          DELETE FROM call_logs_cache;
          DELETE FROM geo_ticks_cache;
          DELETE FROM app_diagnostics;
          DELETE FROM attendance_cache;
        `);
      } else {
        // Seed mock records so there is direct visualization on first load for other users
        const callCount: any = await dbInstance.getFirstAsync('SELECT COUNT(*) as count FROM call_logs_cache');
        if (callCount && callCount.count === 0) {
          const hour = 3600000;
          await dbInstance.runAsync("INSERT INTO call_logs_cache (mobile, name, status, timestamp) VALUES (?, ?, ?, ?)", 
            ['9876543210', 'Rahul Sharma', 'Recent', new Date(Date.now() - 1.2 * hour).toISOString()]);
          await dbInstance.runAsync("INSERT INTO call_logs_cache (mobile, name, status, timestamp) VALUES (?, ?, ?, ?)", 
            ['9123456789', 'Anjali Gupta', 'Engaged', new Date(Date.now() - 3.5 * hour).toISOString()]);
          await dbInstance.runAsync("INSERT INTO call_logs_cache (mobile, name, status, timestamp) VALUES (?, ?, ?, ?)", 
            ['8888888888', 'Vikram Singh', 'Recent', new Date(Date.now() - 24 * hour).toISOString()]);
        }

        const geoCount: any = await dbInstance.getFirstAsync('SELECT COUNT(*) as count FROM geo_ticks_cache');
        if (geoCount && geoCount.count === 0) {
          const hour = 3600000;
          await dbInstance.runAsync("INSERT INTO geo_ticks_cache (latitude, longitude, accuracy, site_name, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?)", 
            [28.6139, 77.2090, 15.2, 'Delhi Site Alpha', new Date(Date.now() - 0.5 * hour).toISOString(), 1]);
          await dbInstance.runAsync("INSERT INTO geo_ticks_cache (latitude, longitude, accuracy, site_name, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?)", 
            [19.0760, 72.8777, 8.5, 'Mumbai Corporate Office', new Date(Date.now() - 2.1 * hour).toISOString(), 0]);
          await dbInstance.runAsync("INSERT INTO geo_ticks_cache (latitude, longitude, accuracy, site_name, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?)", 
            [12.9716, 77.5946, 12.0, 'Bengaluru Center', new Date(Date.now() - 4.5 * hour).toISOString(), 1]);
        }

        const diagCount: any = await dbInstance.getFirstAsync('SELECT COUNT(*) as count FROM app_diagnostics');
        if (diagCount && diagCount.count === 0) {
          await dbInstance.runAsync("INSERT INTO app_diagnostics (event_type, description, timestamp) VALUES (?, ?, ?)", 
            ['SYSTEM_INIT', 'App initialized & SQLite diagnostic DB connected', new Date(Date.now() - 5000).toISOString()]);
          await dbInstance.runAsync("INSERT INTO app_diagnostics (event_type, description, timestamp) VALUES (?, ?, ?)", 
            ['AUTH_CHECK', 'Active session validated with tenant context', new Date().toISOString()]);
        }
      }

    } catch (err) {
      console.error('Failed to initialize SQLite Database:', err);
      throw err;
    }
  }
  return dbInstance;
}

/**
 * Log a tracked phone call to SQLite cache
 */
export async function logCallToSQLite(mobile: string, name: string, status: string): Promise<void> {
  try {
    if (await shouldSkipSQLite()) return;
    const db = await getDB();
    const timestamp = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO call_logs_cache (mobile, name, status, timestamp) VALUES (?, ?, ?, ?)',
      [mobile, name || 'Unknown Caller', status || 'Recent', timestamp]
    );
    await logDiagnosticEvent('CALL_DETECTED', `Call captured for number: ${mobile}`);
  } catch (err) {
    console.error('[SQLite LogCall Error]:', err);
  }
}

/**
 * Log a captured geo background tracking tick to SQLite cache
 */
export async function logGeoTickToSQLite(
  latitude: number,
  longitude: number,
  accuracy: number | null,
  site_name: string,
  synced: boolean = false
): Promise<void> {
  try {
    if (await shouldSkipSQLite()) return;
    const db = await getDB();
    const timestamp = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO geo_ticks_cache (latitude, longitude, accuracy, site_name, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?)',
      [latitude, longitude, accuracy, site_name || 'Unknown Location', timestamp, synced ? 1 : 0]
    );
    await logDiagnosticEvent('GEO_TICK', `Background geo tick recorded at ${site_name || 'Unknown'}`);
  } catch (err) {
    console.error('[SQLite LogGeo Error]:', err);
  }
}

/**
 * Log a general diagnostic event to SQLite
 */
export async function logDiagnosticEvent(event_type: string, description: string): Promise<void> {
  try {
    if (await shouldSkipSQLite()) return;
    const db = await getDB();
    const timestamp = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO app_diagnostics (event_type, description, timestamp) VALUES (?, ?, ?)',
      [event_type, description, timestamp]
    );
  } catch (err) {
    console.error('[SQLite LogDiag Error]:', err);
  }
}

/**
 * Log attendance payload to SQLite cache for offline syncing
 */
export async function logAttendanceToSQLite(payload: any): Promise<void> {
  try {
    if (await shouldSkipSQLite()) return;
    const db = await getDB();
    const timestamp = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO attendance_cache (payload, timestamp, synced) VALUES (?, ?, ?)',
      [JSON.stringify(payload), timestamp, 0]
    );
    await logDiagnosticEvent('ATTENDANCE_OFFLINE', `Attendance marked offline`);
  } catch (err) {
    console.error('[SQLite LogAttendance Error]:', err);
  }
}

/**
 * Get all unsynced attendance records
 */
export async function getUnsyncedAttendance(): Promise<any[]> {
  try {
    if (await shouldSkipSQLite()) return [];
    const db = await getDB();
    const rows: any = await db.getAllAsync('SELECT * FROM attendance_cache WHERE synced = 0');
    return rows || [];
  } catch (err) {
    console.error('[SQLite getUnsyncedAttendance Error]:', err);
    return [];
  }
}

/**
 * Mark offline attendance as synced
 */
export async function markAttendanceSynced(id: number): Promise<void> {
  try {
    if (await shouldSkipSQLite()) return;
    const db = await getDB();
    await db.runAsync('UPDATE attendance_cache SET synced = 1 WHERE id = ?', [id]);
  } catch (err) {
    console.error('[SQLite markAttendanceSynced Error]:', err);
  }
}
