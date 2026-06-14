/**
 * One-time migration: drop the stale `mobile_1` unique index from the doctors collection.
 *
 * Background:
 *   An old schema version had a unique index on `mobile` (field no longer used).
 *   The current schema uses `mobileNumber`. Every new registration inserts mobile: null,
 *   and the second attempt hits E11000 duplicate key on that null value.
 *
 * Run once:
 *   node scripts/fix-doctor-mobile-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;

async function run() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const db = mongoose.connection.db;
    const collection = db.collection('doctors');

    // List current indexes so we can see what's there
    const indexes = await collection.indexes();
    console.log('\nCurrent indexes on doctors collection:');
    indexes.forEach(idx => console.log(' -', idx.name, JSON.stringify(idx.key)));

    // Drop the stale mobile_1 index if it exists
    const hasMobileIndex = indexes.some(idx => idx.name === 'mobile_1');
    if (hasMobileIndex) {
        console.log('\nDropping stale index: mobile_1 ...');
        await collection.dropIndex('mobile_1');
        console.log('✅ Dropped mobile_1 index successfully.');
    } else {
        console.log('\nℹ️  Index mobile_1 not found — nothing to drop.');
    }

    // Also check for any other stale null-value indexes
    const afterIndexes = await collection.indexes();
    console.log('\nIndexes after cleanup:');
    afterIndexes.forEach(idx => console.log(' -', idx.name, JSON.stringify(idx.key)));

    await mongoose.disconnect();
    console.log('\nDone. You can now register doctors without the duplicate key error.');
}

run().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
