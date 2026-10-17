/**
 * 🔄 schemaMigrator.js
 * 
 * Migrates legacy tenant collections (Groups & Ledgers) to the new schema format.
 * Runs once per tenant database connection to ensure compatibility with modern schemas.
 */

async function migrateTenantDb(connection, dbName) {
    try {
        console.log(`[Migrator] Starting schema check/migration for tenant database: ${dbName}`);

        // 1. Migrate Groups
        const groupsColl = connection.collection("groups");
        const legacyGroups = await groupsColl.find({}).toArray();
        
        for (const group of legacyGroups) {
            let updatePayload = {};
            
            // Rename 'name' -> 'groupName'
            if (group.name !== undefined && group.groupName === undefined) {
                updatePayload.groupName = group.name;
                updatePayload.$unset = { name: "" };
            }

            // Normalize nature to singular matching Mongoose enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']
            if (group.nature) {
                const rawNature = group.nature.trim();
                let normalizedNature = rawNature;

                if (/^assets?$/i.test(rawNature)) normalizedNature = "Asset";
                else if (/^liabilit(y|ies)$/i.test(rawNature)) normalizedNature = "Liability";
                else if (/^expenses?$/i.test(rawNature)) normalizedNature = "Expense";
                else if (/^incomes?$/i.test(rawNature) || /^revenues?$/i.test(rawNature)) normalizedNature = "Revenue";
                else if (/^equity$/i.test(rawNature)) normalizedNature = "Equity";

                if (normalizedNature !== rawNature) {
                    updatePayload.nature = normalizedNature;
                }
            }

            if (Object.keys(updatePayload).length > 0) {
                const { $unset, ...setFields } = updatePayload;
                const updateOp = {};
                if (Object.keys(setFields).length > 0) updateOp.$set = setFields;
                if ($unset) updateOp.$unset = $unset;

                await groupsColl.updateOne({ _id: group._id }, updateOp);
                console.log(`  [Groups] Migrated group ID ${group._id}`);
            }
        }

        // 2. Migrate Ledgers
        const ledgersColl = connection.collection("ledgers");
        const legacyLedgers = await ledgersColl.find({}).toArray();

        for (const ledger of legacyLedgers) {
            let updatePayload = {};

            // Rename 'name' -> 'ledgerName'
            if (ledger.name !== undefined && ledger.ledgerName === undefined) {
                updatePayload.ledgerName = ledger.name;
                updatePayload.$unset = { ...updatePayload.$unset, name: "" };
            }

            // Rename 'groupId' -> 'ledgerGroupId'
            if (ledger.groupId !== undefined && ledger.ledgerGroupId === undefined) {
                updatePayload.ledgerGroupId = ledger.groupId;
                updatePayload.$unset = { ...updatePayload.$unset, groupId: "" };
            }

            // Rename 'openingBal' -> 'openingBalance'
            if (ledger.openingBal !== undefined && ledger.openingBalance === undefined) {
                updatePayload.openingBalance = ledger.openingBal;
                updatePayload.$unset = { ...updatePayload.$unset, openingBal: "" };
            }

            // Rename 'nature' -> 'openingBalanceType'
            if (ledger.nature !== undefined && ledger.openingBalanceType === undefined) {
                updatePayload.openingBalanceType = ledger.nature;
                updatePayload.$unset = { ...updatePayload.$unset, nature: "" };
            }

            // Ensure currentBalance exists
            const currentBalVal = ledger.currentBalance !== undefined 
                ? ledger.currentBalance 
                : (ledger.openingBalance !== undefined ? ledger.openingBalance : (ledger.openingBal || 0));

            if (ledger.currentBalance === undefined) {
                updatePayload.currentBalance = currentBalVal;
            }

            if (Object.keys(updatePayload).length > 0) {
                const { $unset, ...setFields } = updatePayload;
                const updateOp = {};
                if (Object.keys(setFields).length > 0) updateOp.$set = setFields;
                if ($unset) updateOp.$unset = $unset;

                await ledgersColl.updateOne({ _id: ledger._id }, updateOp);
                console.log(`  [Ledgers] Migrated ledger ID ${ledger._id}`);
            }
        }

        // 3. Migrate and Resequence Vouchers to continuous numeric series
        const vouchersColl = connection.collection("vouchers");
        const voucherCount = await vouchersColl.countDocuments();
        if (voucherCount > 0) {
            const hasAlphaNumeric = await vouchersColl.findOne({ voucherNo: { $not: /^\d+$/ } });
            let needsResequencing = !!hasAlphaNumeric;

            if (!needsResequencing) {
                const countersColl = connection.collection("counters");
                const counter = await countersColl.findOne({ _id: "voucher_seq" });
                if (!counter || counter.seq !== voucherCount) {
                    needsResequencing = true;
                } else {
                    const allV = await vouchersColl.find({}, { projection: { voucherNo: 1 } }).sort({ date: 1, createdAt: 1, _id: 1 }).toArray();
                    const isSequential = allV.every((v, idx) => v.voucherNo === String(idx + 1));
                    if (!isSequential) needsResequencing = true;
                }
            }

            if (needsResequencing) {
                console.log(`  [Vouchers] Resequencing ${voucherCount} vouchers in ${dbName} into clean numeric series 1..${voucherCount}...`);
                const allVouchers = await vouchersColl.find({}).sort({ date: 1, createdAt: 1, _id: 1 }).toArray();

                // Phase 1: Set temporary IDs to avoid unique index violation
                const tempOps = allVouchers.map(v => ({
                    updateOne: {
                        filter: { _id: v._id },
                        update: { $set: { voucherNo: `__TEMP_${v._id}` } }
                    }
                }));
                await vouchersColl.bulkWrite(tempOps, { ordered: false });

                // Phase 2: Set clean sequential numeric numbers 1, 2, 3...
                const numericOps = allVouchers.map((v, idx) => ({
                    updateOne: {
                        filter: { _id: v._id },
                        update: { $set: { voucherNo: String(idx + 1) } }
                    }
                }));
                await vouchersColl.bulkWrite(numericOps, { ordered: false });

                // Phase 3: Set sequence counter in counters collection
                const countersColl = connection.collection("counters");
                await countersColl.updateOne(
                    { _id: "voucher_seq" },
                    { $set: { seq: allVouchers.length } },
                    { upsert: true }
                );
                console.log(`  [Vouchers] Successfully resequenced ${allVouchers.length} vouchers to numeric series 1..${allVouchers.length}`);
            }
        }

        console.log(`[Migrator] Migration successfully complete for tenant: ${dbName}`);
    } catch (err) {
        console.error(`[Migrator] Schema migration error on tenant database ${dbName}:`, err.message);
    }
}

module.exports = { migrateTenantDb };
