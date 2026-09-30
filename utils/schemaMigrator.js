/**
 * 🔄 schemaMigrator.js
 *
 * Migrates legacy tenant collections (Groups & Ledgers) to the new schema format.
 * Runs AT MOST ONCE per tenant connection instance (guarded by a WeakSet so it
 * never fires again on subsequent requests to the same tenant).
 *
 * Strategy: use MongoDB bulk-write operations instead of per-document updateOne
 * calls to minimise round-trips on large tenants.
 */

/** Track connections and DBs that have already been migrated in this process lifetime. */
const migratedConnections = new WeakSet();
const migratedDbs = new Set();

async function migrateTenantDb(connection, dbName) {
    // ── Guard: skip if already migrated for this connection or dbName ───────
    if (migratedDbs.has(dbName) || migratedConnections.has(connection)) return;
    migratedConnections.add(connection);   // mark immediately to prevent races
    migratedDbs.add(dbName);

    try {
        console.log(`[Migrator] Starting schema check for: ${dbName}`);

        // ── 1. Migrate Groups ────────────────────────────────────────────────
        const groupsColl = connection.collection('groups');

        // Only fetch documents that still have the OLD field shapes.
        // This avoids loading already-migrated documents at all.
        const legacyGroups = await groupsColl
            .find({
                $or: [
                    { name: { $exists: true }, groupName: { $exists: false } },
                    { nature: { $nin: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] } },
                ],
            })
            .project({ _id: 1, name: 1, groupName: 1, nature: 1 })
            .toArray();

        if (legacyGroups.length > 0) {
            const groupBulk = groupsColl.initializeUnorderedBulkOp();

            for (const group of legacyGroups) {
                const $set = {};
                const $unset = {};

                // Rename 'name' -> 'groupName'
                if (group.name !== undefined && group.groupName === undefined) {
                    $set.groupName = group.name;
                    $unset.name = '';
                }

                // Normalize nature to Mongoose enum
                if (group.nature) {
                    const rawNature = group.nature.trim();
                    let normalizedNature = rawNature;
                    if (/^assets?$/i.test(rawNature))                                         normalizedNature = 'Asset';
                    else if (/^liabilit(y|ies)$/i.test(rawNature))                           normalizedNature = 'Liability';
                    else if (/^expenses?$/i.test(rawNature))                                  normalizedNature = 'Expense';
                    else if (/^incomes?$/i.test(rawNature) || /^revenues?$/i.test(rawNature)) normalizedNature = 'Revenue';
                    else if (/^equity$/i.test(rawNature))                                     normalizedNature = 'Equity';

                    if (normalizedNature !== rawNature) $set.nature = normalizedNature;
                }

                if (Object.keys($set).length > 0 || Object.keys($unset).length > 0) {
                    const updateOp = {};
                    if (Object.keys($set).length > 0)   updateOp.$set   = $set;
                    if (Object.keys($unset).length > 0) updateOp.$unset = $unset;
                    groupBulk.find({ _id: group._id }).updateOne(updateOp);
                }
            }

            const groupResult = await groupBulk.execute();
            console.log(`[Migrator] Groups migrated: ${groupResult.nModified ?? groupResult.modifiedCount ?? 0}`);
        }

        // ── 2. Migrate Ledgers ───────────────────────────────────────────────
        const ledgersColl = connection.collection('ledgers');

        const legacyLedgers = await ledgersColl
            .find({
                $or: [
                    { name: { $exists: true },        ledgerName: { $exists: false } },
                    { groupId: { $exists: true },      ledgerGroupId: { $exists: false } },
                    { openingBal: { $exists: true },   openingBalance: { $exists: false } },
                    { nature: { $exists: true },       openingBalanceType: { $exists: false } },
                    { currentBalance: { $exists: false } },
                ],
            })
            .project({ _id: 1, name: 1, ledgerName: 1, groupId: 1, ledgerGroupId: 1,
                       openingBal: 1, openingBalance: 1, nature: 1, openingBalanceType: 1,
                       currentBalance: 1 })
            .toArray();

        if (legacyLedgers.length > 0) {
            const ledgerBulk = ledgersColl.initializeUnorderedBulkOp();

            for (const ledger of legacyLedgers) {
                const $set = {};
                const $unset = {};

                if (ledger.name !== undefined       && ledger.ledgerName === undefined)        { $set.ledgerName = ledger.name;           $unset.name = ''; }
                if (ledger.groupId !== undefined    && ledger.ledgerGroupId === undefined)     { $set.ledgerGroupId = ledger.groupId;     $unset.groupId = ''; }
                if (ledger.openingBal !== undefined && ledger.openingBalance === undefined)    { $set.openingBalance = ledger.openingBal; $unset.openingBal = ''; }
                if (ledger.nature !== undefined     && ledger.openingBalanceType === undefined) { $set.openingBalanceType = ledger.nature; $unset.nature = ''; }

                if (ledger.currentBalance === undefined) {
                    $set.currentBalance = ledger.openingBalance ?? ledger.openingBal ?? 0;
                }

                if (Object.keys($set).length > 0 || Object.keys($unset).length > 0) {
                    const updateOp = {};
                    if (Object.keys($set).length > 0)   updateOp.$set   = $set;
                    if (Object.keys($unset).length > 0) updateOp.$unset = $unset;
                    ledgerBulk.find({ _id: ledger._id }).updateOne(updateOp);
                }
            }

            const ledgerResult = await ledgerBulk.execute();
            console.log(`[Migrator] Ledgers migrated: ${ledgerResult.nModified ?? ledgerResult.modifiedCount ?? 0}`);
        }

        if (legacyGroups.length === 0 && legacyLedgers.length === 0) {
            console.log(`[Migrator] No legacy documents found for: ${dbName} — nothing to do.`);
        } else {
            console.log(`[Migrator] Migration complete for: ${dbName}`);
        }
    } catch (err) {
        // Don't re-throw: migration errors must never block API traffic
        console.error(`[Migrator] Error on ${dbName}:`, err.message);
    }
}

module.exports = { migrateTenantDb };
